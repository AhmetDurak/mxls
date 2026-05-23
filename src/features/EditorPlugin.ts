import type { editor } from 'monaco-editor'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import { SchemaCompleter } from '../completion/SchemaCompleter'
import { SchemaDecorator } from '../validation/SchemaDecorator'
import { TemplateBuilder } from '../template/TemplateBuilder'
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
    private completionDisposable: { dispose(): void } | null = null

    constructor(
        private readonly monacoApi: IMonacoApi,
        private readonly codeEditor: editor.IStandaloneCodeEditor,
        private readonly registry: ISchemaRegistry,
        private readonly options: EditorPluginOptions = {},
    ) {
        this.completer = new SchemaCompleter(registry, monacoApi)
        this.decorator = new SchemaDecorator(monacoApi, codeEditor)
    }

    /** Register the completion provider and run the first validation pass. */
    activate(): void {
        this.completionDisposable = this.monacoApi.languages.registerCompletionItemProvider(
            'xml',
            this.completer.provider(),
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

    /** Unregister the completion provider and clear all validation decorations. */
    dispose(): void {
        this.decorator.dispose()
        this.completionDisposable?.dispose()
        this.completionDisposable = null
    }

    private revalidate(): void {
        const workers = this.registry.getAllWorkers()
        this.decorator.revalidate(() => workers)
    }
}
