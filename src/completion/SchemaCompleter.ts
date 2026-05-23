import type { languages } from 'monaco-editor'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import type { ICompletion } from '../types'
import { CompletionType } from '../types'
import { TextAnalyzer } from './TextAnalyzer'
import { CompletionBuilder } from './CompletionBuilder'
import { CompletionCache } from './CompletionCache'
import { NamespaceResolver } from './NamespaceResolver'

/**
 * Thin Monaco CompletionItemProvider shell.
 * All analysis is delegated to TextAnalyzer; all item construction to workers
 * (via doCompletion) and CompletionBuilder.
 */
export class SchemaCompleter {
    private readonly analyzer = new TextAnalyzer()
    private readonly builder: CompletionBuilder
    private readonly cache = new CompletionCache()
    private readonly resolver = new NamespaceResolver()

    constructor(
        private readonly xsdManager: ISchemaRegistry,
        monacoApi: IMonacoApi,
    ) {
        this.builder = new CompletionBuilder(monacoApi)
    }

    /** Returns the Monaco CompletionItemProvider to register. */
    provider(): languages.CompletionItemProvider {
        return {
            triggerCharacters: ['<', ' ', '/', '=', '"', "'"],
            provideCompletionItems: (model, position, context) => {
                const fullText = model.getValue()
                const text = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                })

                const type = this.analyzer.getCompletionType(
                    text,
                    context.triggerKind,
                    context.triggerCharacter,
                )
                if (type === CompletionType.none) return { suggestions: [] }

                const workers = this.resolver.resolve(fullText, this.xsdManager)
                if (workers.length === 0) return { suggestions: [] }

                const parentTag = this.analyzer.getParentTag(text) ?? ''
                const ancestorChain = this.analyzer.getAncestorChain(text)

                // Cache element/attribute completions; skip for attribute values
                if (
                    type !== CompletionType.attributeValue &&
                    type !== CompletionType.closingElement
                ) {
                    const key = this.cache.makeKey(parentTag, ancestorChain)
                    const hit = this.cache.get(key)
                    if (hit) return { suggestions: hit as unknown as languages.CompletionItem[] }

                    const items = this.gather(type, parentTag, ancestorChain, workers, text)
                    this.cache.set(key, items)
                    return { suggestions: items as unknown as languages.CompletionItem[] }
                }

                return {
                    suggestions: this.gather(
                        type,
                        parentTag,
                        ancestorChain,
                        workers,
                        text,
                    ) as unknown as languages.CompletionItem[],
                }
            },
        }
    }

    /** Invalidate the cache (call when a schema is added or updated). */
    invalidateCache(): void {
        this.cache.clear()
        this.resolver.invalidate()
    }

    private gather(
        type: CompletionType,
        parentTag: string,
        ancestorChain: string[],
        workers: ReturnType<NamespaceResolver['resolve']>,
        text: string,
    ): ICompletion[] {
        // For attribute completions the cursor is inside an unclosed opening tag,
        // so getParentTag (which tracks *closed* tags) returns the wrong element.
        // getCurrentOpenTagName returns the element whose `<tagName` has not yet
        // received its closing `>` — the correct target for attribute queries.
        const openTag = this.analyzer.getCurrentOpenTagName(text)

        switch (type) {
            case CompletionType.element:
            case CompletionType.incompleteElement: {
                const results: ICompletion[] = []
                for (const worker of workers) {
                    results.push(...worker.doCompletion(type, parentTag, ancestorChain))
                }
                return results
            }

            case CompletionType.attribute:
            case CompletionType.incompleteAttribute: {
                const tagName = openTag ?? parentTag
                const results: ICompletion[] = []
                for (const worker of workers) {
                    results.push(...worker.doCompletion(CompletionType.attribute, tagName, ancestorChain))
                }
                return results
            }

            case CompletionType.attributeValue: {
                const attrName = this.analyzer.getAttrNameBeforeCursor(text)
                if (!attrName) return []
                const tagName = openTag ?? parentTag
                const results: ICompletion[] = []
                for (const worker of workers) {
                    const values = worker.getEnumValuesForAttribute(tagName, attrName)
                    results.push(...this.builder.buildAttributeValues(values))
                }
                return results
            }

            case CompletionType.closingElement:
                return parentTag ? [this.builder.buildClosingTag(parentTag)] : []

            default:
                return []
        }
    }
}
