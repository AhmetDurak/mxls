import type { MarkerSeverity, languages, IRange } from 'monaco-editor'

// ─── Minimal editor interfaces ────────────────────────────────────────────────
// These describe only the editor surface that mxls actually calls.
// Using these instead of editor.IStandaloneCodeEditor / editor.ITextModel
// prevents version-mismatch errors when the consumer's monaco-editor version
// differs from the one installed in mxls' own node_modules.

/** Decoration styling options — subset of editor.IModelDecorationOptions. */
export interface IDecorationOptions {
    isWholeLine?: boolean
    className?: string
    hoverMessage?: { value: string }
    overviewRuler?: { color: string; position: number }
    minimap?: { color: string; position: number }
}

/** A single editor decoration — subset of editor.IModelDeltaDecoration. */
export interface IModelDecoration {
    range: IRange
    options: IDecorationOptions
}

/** Editor text model surface that mxls uses. */
export interface ICodeEditorModel {
    getValue(): string
    setValue(newValue: string): void
    getFullModelRange(): IRange
    getLineCount(): number
    getLineMaxColumn(lineNumber: number): number
    pushEditOperations(
        beforeCursorState: null | unknown[],
        editOperations: Array<{ range: IRange; text: string }>,
        computeUndoEdits: () => null,
    ): void
}

/** Editor surface that mxls uses — satisfied by editor.IStandaloneCodeEditor from any recent Monaco version. */
export interface ICodeEditor {
    getModel(): ICodeEditorModel | null
    addAction(descriptor: {
        id: string
        label: string
        keybindings?: number[]
        contextMenuGroupId?: string
        contextMenuOrder?: number
        run: () => void
    }): { dispose(): void }
    createDecorationsCollection(
        decorations: IModelDecoration[],
    ): { set(decorations: IModelDecoration[]): void; clear(): void }
    onDidChangeModelContent(listener: () => void): { dispose(): void }
}

// ─── Monaco API injection surface ─────────────────────────────────────────────

/**
 * The Monaco API surface that mxls needs — injected at construction, never
 * accessed via `window.monaco`.  All runtime enum lookups (CompletionItemKind,
 * KeyCode, …) go through this object so the library works in any host.
 */
export interface IMonacoApi {
    /** Constructs an IRange — used by DecorationMapper. */
    Range: new (
        startLineNumber: number,
        startColumn: number,
        endLineNumber: number,
        endColumn: number,
    ) => IRange

    KeyCode: {
        KeyF: number
        KeyG: number
        /** Escape key */
        Escape: number
        [key: string]: number
    }

    KeyMod: {
        CtrlCmd: number
        Shift: number
        Alt: number
        WinCtrl: number
    }

    languages: {
        /** Enum values needed by CompletionBuilder. */
        CompletionItemKind: typeof languages.CompletionItemKind
        CompletionItemInsertTextRule: typeof languages.CompletionItemInsertTextRule

        registerCompletionItemProvider(
            languageId: string,
            provider: languages.CompletionItemProvider,
        ): { dispose(): void }

        registerHoverProvider(
            languageId: string,
            provider: languages.HoverProvider,
        ): { dispose(): void }
    }

    editor: {
        /** Used by SchemaDecorator (fallback main-thread path). */
        MarkerSeverity: typeof MarkerSeverity
    }
}
