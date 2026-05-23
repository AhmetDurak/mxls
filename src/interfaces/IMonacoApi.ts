import type { MarkerSeverity, languages, IRange } from 'monaco-editor'

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
