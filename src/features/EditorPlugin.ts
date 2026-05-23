import type { editor } from 'monaco-editor'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import { SchemaCompleter } from '../completion/SchemaCompleter'
import { SchemaDecorator } from '../validation/SchemaDecorator'
import { TemplateBuilder } from '../template/TemplateBuilder'
import { XmlFormatter } from '../formatter/XmlFormatter'
import { SchemaHover } from '../hover/SchemaHover'
import { getRootTag } from '../utils/XmlTextUtils'

export interface EditorPluginOptions {
    /**
     * Called when `generateTemplate` needs to know the desired nesting depth.
     * Return a positive integer, or undefined/null to abort generation.
     */
    promptLevel?: () => number | null | undefined
}

/**
 * Top-level wiring class.  Holds the editor reference; all other classes are
 * editor-free.  Activate once the Monaco editor and schema registry are ready.
 */
export class EditorPlugin {
    private readonly completer: SchemaCompleter
    private readonly decorator: SchemaDecorator
    private readonly template = new TemplateBuilder()
    private readonly formatter = new XmlFormatter()
    private readonly hover: SchemaHover
    private completionDisposable: { dispose(): void } | null = null
    private hoverDisposable: { dispose(): void } | null = null
    private reformatDisposable: { dispose(): void } | null = null
    private generateDisposable: { dispose(): void } | null = null

    constructor(
        private readonly monacoApi: IMonacoApi,
        private readonly codeEditor: editor.IStandaloneCodeEditor,
        private readonly registry: ISchemaRegistry,
        private readonly options: EditorPluginOptions = {},
    ) {
        this.completer = new SchemaCompleter(registry, monacoApi)
        this.decorator = new SchemaDecorator(monacoApi, codeEditor)
        this.hover = new SchemaHover(registry)
    }

    /** Register the completion and hover providers and run the first validation pass. */
    activate(): void {
        this.completionDisposable = this.monacoApi.languages.registerCompletionItemProvider(
            'xml',
            this.completer.provider(),
        )
        this.hoverDisposable = this.monacoApi.languages.registerHoverProvider(
            'xml',
            this.hover.provider(),
        )
        this.revalidate()
    }

    /**
     * Call after adding, updating, or removing schemas so completions and
     * validation decorations are refreshed.
     */
    onSchemaChange(): void {
        this.completer.invalidateCache()
        this.revalidate()
    }

    /**
     * Generate an XML skeleton from the document's root tag and replace the
     * current editor content.  The nesting depth comes from `options.promptLevel`.
     */
    generateTemplate(withAttributes: boolean): void {
        const model = this.codeEditor.getModel()
        if (!model) return

        const rootTag = getRootTag(model.getValue())
        if (!rootTag) return

        const level = this.options.promptLevel?.() ?? 3
        if (!level) return

        const xml = this.template.buildFromRoot(rootTag, level, withAttributes, this.registry.getAllWorkers())
        model.setValue(xml)
    }

    async reformatXml(): Promise<void> {
        const model = this.codeEditor.getModel()
        if (!model) return

        const original = model.getValue()
        let formatted: string
        try {
            formatted = await this.formatter.format(original)
        } catch {
            return
        }

        if (formatted === original) return

        const fullRange = model.getFullModelRange()
        model.pushEditOperations([], [{ range: fullRange, text: formatted }], () => null)
    }

    addReformatAction(): void {
        this.reformatDisposable?.dispose()
        this.reformatDisposable = this.codeEditor.addAction({
            id: 'mxls.reformat',
            label: 'Reformat XML',
            keybindings: [this.monacoApi.KeyMod.CtrlCmd | this.monacoApi.KeyMod.Shift | this.monacoApi.KeyCode.KeyF],
            contextMenuGroupId: '1_modification',
            contextMenuOrder: 1,
            run: () => { void this.reformatXml() },
        })
    }

    addGenerateAction(): void {
        this.generateDisposable?.dispose()
        this.generateDisposable = this.codeEditor.addAction({
            id: 'mxls.generate',
            label: 'Generate XML Template',
            keybindings: [this.monacoApi.KeyMod.CtrlCmd | this.monacoApi.KeyMod.Shift | this.monacoApi.KeyCode.KeyG],
            contextMenuGroupId: '1_modification',
            contextMenuOrder: 2,
            run: () => { this.generateTemplate(true) },
        })
    }

    /** Unregister all providers and clear all validation decorations. */
    dispose(): void {
        this.decorator.dispose()
        this.completionDisposable?.dispose()
        this.completionDisposable = null
        this.hoverDisposable?.dispose()
        this.hoverDisposable = null
        this.reformatDisposable?.dispose()
        this.reformatDisposable = null
        this.generateDisposable?.dispose()
        this.generateDisposable = null
    }

    private revalidate(): void {
        const workers = this.registry.getAllWorkers()
        this.decorator.revalidate(() => workers)
    }
}
