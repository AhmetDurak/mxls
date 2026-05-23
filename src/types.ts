import type { editor, languages, IMarkdownString, IRange } from 'monaco-editor'

// ─── XSD config ──────────────────────────────────────────────────────────────

export interface IXsd {
    path: string
    value: string
    namespace?: string
    /** Match by substring rather than exact path equality */
    nonStrictPath?: boolean
    /** Always include this schema regardless of root tag */
    alwaysInclude?: boolean
    /** Include this schema only when the document root tag matches one of these */
    includeIfRootTag?: string[]
}

// ─── Schema shape ─────────────────────────────────────────────────────────────

export const ContentModelType = {
    sequence: 'sequence',
    choice: 'choice',
    all: 'all',
    simpleContent: 'simpleContent',
} as const
export type ContentModelType = typeof ContentModelType[keyof typeof ContentModelType]

export interface DocumentNode {
    name?: string
    documentation?: string
    type?: string
    use?: string
    ref?: string
    minOccurs?: string
    maxOccurs?: string
    selfClose?: boolean
    pattern?: string
    requiredAttribute?: DocumentNode[]
    elements?: DocumentNode[]
}

// ─── Completion ───────────────────────────────────────────────────────────────

export enum CompletionType {
    none,
    element,
    attribute,
    incompleteElement,
    closingElement,
    snippet,
    incompleteAttribute,
    attributeValue,
}

export interface INamespaceInfo {
    prefix: string
    path: string
}

/** Monaco completion item — uses `import type` so it is erased at runtime. */
export interface ICompletion {
    label: string | languages.CompletionItemLabel
    kind: languages.CompletionItemKind
    tags?: ReadonlyArray<languages.CompletionItemTag>
    detail?: string
    documentation?: string | IMarkdownString
    sortText?: string
    filterText?: string
    preselect?: boolean
    insertText: string
    insertTextRules?: languages.CompletionItemInsertTextRule
    range?:
        | IRange
        | { insert: IRange; replace: IRange }
    commitCharacters?: string[]
    additionalTextEdits?: editor.ISingleEditOperation[]
    command?: languages.Command
}

// ─── Validation ───────────────────────────────────────────────────────────────

export enum Severity {
    warning = 'warning',
    error = 'error',
    fatalError = 'fatalError',
}

/** Structured validation error — no string-parsing needed at the decoration layer. */
export interface ValidationError {
    line: number
    col: number
    message: string
    severity: Severity
}
