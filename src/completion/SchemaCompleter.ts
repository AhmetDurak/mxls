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
        private readonly monacoApi: IMonacoApi,
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

                // Monaco requires every CompletionItem to carry a range;
                // items without one are silently dropped. Compute the word range
                // at the cursor once and stamp it onto every suggestion we return.
                const word = model.getWordUntilPosition(position)
                const range = new this.monacoApi.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn,
                )
                const withRange = (items: ICompletion[]): languages.CompletionItem[] =>
                    items.map(item => ({ ...item, range }) as unknown as languages.CompletionItem)

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

                // Only cache element completions. Attribute completions are excluded
                // because they use `openTag` (the currently-open tag) as the lookup key,
                // but the cache key is built from `parentTag` (the innermost *closed*
                // element). The two diverge while typing `<Elem `, so caching attributes
                // under parentTag pollutes subsequent element-completion lookups.
                if (
                    type === CompletionType.element ||
                    type === CompletionType.incompleteElement
                ) {
                    const key = this.cache.makeKey(parentTag, ancestorChain)
                    const hit = this.cache.get(key)
                    if (hit) return { suggestions: withRange(hit) }

                    const items = this.gather(type, parentTag, ancestorChain, workers, text)
                    // Only cache non-empty results — a transient empty (schema not yet
                    // ready, cursor in mid-snippet position) must not poison the key.
                    if (items.length > 0) this.cache.set(key, items)
                    return { suggestions: withRange(items) }
                }

                return {
                    suggestions: withRange(
                        this.gather(type, parentTag, ancestorChain, workers, text),
                    ),
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
                // Filter out elements that have reached their maxOccurs limit
                return results.filter(item => {
                    if (!item.maxOccurs || item.maxOccurs === 'unbounded') return true
                    const max = parseInt(item.maxOccurs, 10)
                    if (isNaN(max)) return true
                    const label = typeof item.label === 'string' ? item.label : item.label.label
                    const count = this.analyzer.countChildOccurrences(text, parentTag, label)
                    return count < max
                })
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
                // Cross-schema type resolution: if the attribute's type is defined in
                // another worker (e.g. a shared simpleType XSD), look it up there.
                if (results.length === 0) {
                    for (const worker of workers) {
                        const attrDef = worker.getAttributesForElement(tagName)
                            .find(a => a.name === attrName)
                        if (!attrDef?.type) continue
                        const typeName = attrDef.type.replace(/^[^:]+:/, '')
                        for (const w of workers) {
                            const values = w.getEnumValuesForNamedType(typeName)
                            if (values.length > 0) {
                                results.push(...this.builder.buildAttributeValues(values))
                                break
                            }
                        }
                        if (results.length > 0) break
                    }
                }
                const dynamicValues = this.xsdManager.getDynamicEnumValues(tagName, attrName)
                if (dynamicValues.length > 0) {
                    results.push(...this.builder.buildAttributeValues(dynamicValues))
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
