import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { DocumentNode, ICompletion } from '../types'

/** Converts raw DocumentNode / enum-value data into Monaco ICompletion items. */
export class CompletionBuilder {
    constructor(private readonly monaco: IMonacoApi) {}

    buildElementCompletions(nodes: DocumentNode[], nsPrefix: string): ICompletion[] {
        return nodes.map(node => this.buildElementCompletion(node, nsPrefix))
    }

    buildElementCompletion(node: DocumentNode, nsPrefix: string): ICompletion {
        const { CompletionItemKind, CompletionItemInsertTextRule } = this.monaco.languages
        const name = node.name ?? ''
        const label = nsPrefix ? `${nsPrefix}:${name}` : name
        const insertText = node.selfClose
            ? `<${label} />`
            : `<${label}>$0</${label}>`

        return {
            label,
            kind: CompletionItemKind.Property,
            detail: node.type,
            documentation: node.documentation,
            insertText,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        }
    }

    buildAttributeCompletions(nodes: DocumentNode[], usedNames: string[]): ICompletion[] {
        return nodes
            .filter(n => n.name !== undefined && !usedNames.includes(n.name))
            .map(node => this.buildAttributeCompletion(node))
    }

    buildAttributeCompletion(node: DocumentNode): ICompletion {
        const { CompletionItemKind, CompletionItemInsertTextRule } = this.monaco.languages
        const name = node.name ?? ''
        return {
            label: name,
            kind: CompletionItemKind.Field,
            detail: node.type,
            documentation: node.documentation,
            insertText: `${name}="$0"`,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        }
    }

    buildEnumCompletions(values: string[]): ICompletion[] {
        const { CompletionItemKind } = this.monaco.languages
        return values.map(v => ({
            label: v,
            kind: CompletionItemKind.Enum,
            insertText: v,
        }))
    }

    buildClosingTagCompletion(tagName: string, nsPrefix: string): ICompletion {
        const { CompletionItemKind } = this.monaco.languages
        const label = nsPrefix ? `${nsPrefix}:${tagName}` : tagName
        return {
            label: `/${label}>`,
            kind: CompletionItemKind.Property,
            insertText: `/${label}>`,
        }
    }
}
