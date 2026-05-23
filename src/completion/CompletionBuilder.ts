import TurndownService from 'turndown'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { DocumentNode, ICompletion } from '../types'

const td = new TurndownService()

function docToMarkdown(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    // Only run TurndownService when the text looks like HTML
    return /<[a-z][\s\S]*>/i.test(raw) ? td.turndown(raw) : raw
}

/** Converts DocumentNode schema data into Monaco ICompletion items. */
export class CompletionBuilder {
    constructor(private readonly monacoApi: IMonacoApi) {}

    /**
     * Build element completions.
     * @param ns         Namespace prefix (e.g. "ns1"), or undefined for none.
     * @param withoutTag When true the `<` is already in the editor; omit it.
     * @param incomplete When true the user has already typed a partial tag name;
     *                   emit only the label (no snippet) so Monaco replaces the word.
     */
    buildElements(
        nodes: DocumentNode[],
        ns: string | undefined,
        withoutTag: boolean,
        incomplete: boolean,
    ): ICompletion[] {
        const { CompletionItemKind, CompletionItemInsertTextRule } = this.monacoApi.languages
        return nodes.map(node => {
            const name = node.name ?? ''
            const label = ns ? `${ns}:${name}` : name
            const reqAttrs = node.requiredAttribute ?? []
            const docText = docToMarkdown(node.documentation)

            if (incomplete) {
                return {
                    label,
                    kind: CompletionItemKind.Property,
                    detail: node.type,
                    documentation: docText ? { value: docText } : undefined,
                    insertText: label,
                }
            }

            let idx = 1
            const attrPart = reqAttrs.length
                ? ' ' + reqAttrs.map(a => `${a.name ?? ''}="\${${idx++}}"`).join(' ')
                : ''
            const contentIdx = idx

            let insertText: string
            if (node.selfClose) {
                insertText = withoutTag
                    ? `${label}${attrPart}/>`
                    : `<${label}${attrPart}/>`
            } else {
                insertText = withoutTag
                    ? `${label}${attrPart}>\${${contentIdx}}</${label}>`
                    : `<${label}${attrPart}>\${${contentIdx}}</${label}>`
            }

            return {
                label,
                kind: CompletionItemKind.Property,
                detail: node.type,
                documentation: docText ? { value: docText } : undefined,
                insertText,
                insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            }
        })
    }

    /**
     * Build attribute name completions.
     * @param incomplete When true use plain insert text (no `="$0"` snippet) because
     *                   the user is mid-word and Monaco will replace the partial word.
     */
    buildAttributes(nodes: DocumentNode[], incomplete: boolean): ICompletion[] {
        const { CompletionItemKind, CompletionItemInsertTextRule } = this.monacoApi.languages
        return nodes.map(node => {
            const name = node.name ?? ''
            const docText = docToMarkdown(node.documentation)
            const isRequired = node.use === 'required'
            return {
                label: name,
                kind: CompletionItemKind.Field,
                detail: node.type,
                documentation: docText ? { value: docText } : undefined,
                preselect: isRequired,
                insertText: incomplete ? name : `${name}="$0"`,
                insertTextRules: incomplete
                    ? undefined
                    : CompletionItemInsertTextRule.InsertAsSnippet,
            }
        })
    }

    /** Build enum/string value completions for an attribute. */
    buildAttributeValues(values: string[]): ICompletion[] {
        const { CompletionItemKind } = this.monacoApi.languages
        return values.map(v => ({
            label: v,
            kind: CompletionItemKind.Enum,
            insertText: v,
        }))
    }

    /** Build a single closing-tag completion for `</tagName>`. */
    buildClosingTag(tagName: string): ICompletion {
        const { CompletionItemKind } = this.monacoApi.languages
        return {
            label: `/${tagName}>`,
            kind: CompletionItemKind.Property,
            insertText: `/${tagName}>`,
        }
    }
}
