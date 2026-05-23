import type { editor } from 'monaco-editor'
import { debounce } from 'ts-debounce'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import { SchemaValidator } from './SchemaValidator'
import { DecorationMapper } from './DecorationMapper'

/**
 * Thin Monaco integration shell for XML validation.
 * Wires model-change events → SchemaValidator → DecorationMapper → decorations.
 * All validation logic lives in SchemaValidator (no Monaco dependency there).
 */
export class SchemaDecorator {
    private readonly validator = new SchemaValidator()
    private readonly mapper: DecorationMapper
    private decorations: editor.IEditorDecorationsCollection
    private readonly disposeListener: { dispose(): void }
    private getWorkers: (() => ISchemaWorker[]) | null = null

    constructor(
        monacoApi: IMonacoApi,
        private readonly codeEditor: editor.IStandaloneCodeEditor,
    ) {
        this.mapper = new DecorationMapper(monacoApi)
        this.decorations = codeEditor.createDecorationsCollection([])

        const debouncedRun = debounce(() => this.run(), 500)

        this.disposeListener = codeEditor.onDidChangeModelContent(() => {
            if (this.getWorkers) debouncedRun()
        })
    }

    /**
     * Attach a worker provider and trigger an immediate validation run.
     * Call this after the schema registry is ready.
     */
    revalidate(getWorkers: () => ISchemaWorker[]): void {
        this.getWorkers = getWorkers
        this.run()
    }

    /** Remove the change listener and clear all decorations. */
    dispose(): void {
        this.disposeListener.dispose()
        this.decorations.clear()
    }

    private run(): void {
        const model = this.codeEditor.getModel()
        if (!model || !this.getWorkers) return

        const xml = model.getValue()
        const workers = this.getWorkers()
        const errors = this.validator.validate(xml, workers)
        const newDecorations = this.mapper.toDecorations(errors, model)

        this.decorations.set(newDecorations)
    }
}
