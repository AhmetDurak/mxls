import type { languages } from 'monaco-editor'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import type { ICompletion } from '../types'
import { CompletionType } from '../types'
import { analyzeContext } from './TextAnalyzer'
import { CompletionBuilder } from './CompletionBuilder'
import { CompletionCache } from './CompletionCache'
import { NamespaceResolver, type WorkerWithPrefix } from './NamespaceResolver'
import {
    getRootTag,
    extractUsedAttributes,
    extractCurrentAttributeName,
} from '../utils/XmlTextUtils'

/** Thin Monaco completion-provider shell. Delegates all logic to pure helpers. */
export class SchemaCompleter {
    private readonly builder: CompletionBuilder
    private readonly cache: CompletionCache
    private readonly resolver: NamespaceResolver
    private disposable: { dispose(): void } | undefined

    constructor(
        private readonly monaco: IMonacoApi,
        private readonly manager: ISchemaRegistry,
    ) {
        this.builder = new CompletionBuilder(monaco)
        this.cache = new CompletionCache()
        this.resolver = new NamespaceResolver()
    }

    /** Registers the provider with Monaco. Call once after construction. */
    register(): void {
        this.disposable = this.monaco.languages.registerCompletionItemProvider('xml', {
            triggerCharacters: ['<', ' ', '/', '=', '"', "'"],
            provideCompletionItems: (model, position) => {
                const fullText = model.getValue()
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                })

                const context = analyzeContext(textUntilPosition)
                if (context.completionType === CompletionType.none) return { suggestions: [] }

                const rootTag = getRootTag(fullText)
                const workers = this.resolver.getActiveWorkers(fullText, this.manager, rootTag)
                if (workers.length === 0) return { suggestions: [] }

                // Attribute-value completions depend on the attribute name — skip cache
                if (context.completionType !== CompletionType.attributeValue) {
                    const key = this.cache.makeKey(
                        context.completionType,
                        context.parentTag,
                        context.ancestorChain,
                    )
                    const cached = this.cache.get(key)
                    if (cached) return { suggestions: cached as unknown as languages.CompletionItem[] }

                    const suggestions = this.gatherSuggestions(
                        context.completionType,
                        context.parentTag,
                        context.ancestorChain,
                        workers,
                        textUntilPosition,
                    )
                    this.cache.set(key, suggestions)
                    return { suggestions: suggestions as unknown as languages.CompletionItem[] }
                }

                return {
                    suggestions: this.gatherSuggestions(
                        context.completionType,
                        context.parentTag,
                        context.ancestorChain,
                        workers,
                        textUntilPosition,
                    ) as unknown as languages.CompletionItem[],
                }
            },
        })
    }

    /** Invalidate the completion cache (call when a schema is added or updated). */
    invalidateCache(): void {
        this.cache.clear()
    }

    dispose(): void {
        this.disposable?.dispose()
        this.cache.clear()
    }

    private gatherSuggestions(
        completionType: CompletionType,
        parentTag: string,
        ancestorChain: string[],
        workers: WorkerWithPrefix[],
        textUntilPosition: string,
    ): ICompletion[] {
        switch (completionType) {
            case CompletionType.element:
            case CompletionType.incompleteElement:
                return this.elementSuggestions(parentTag, ancestorChain, workers)

            case CompletionType.attribute:
            case CompletionType.incompleteAttribute:
                return this.attributeSuggestions(parentTag, workers, textUntilPosition)

            case CompletionType.attributeValue:
                return this.attributeValueSuggestions(parentTag, workers, textUntilPosition)

            case CompletionType.closingElement:
                return this.closingTagSuggestions(parentTag)

            default:
                return []
        }
    }

    private elementSuggestions(
        parentTag: string,
        ancestorChain: string[],
        workers: WorkerWithPrefix[],
    ): ICompletion[] {
        const results: ICompletion[] = []
        for (const { worker, prefix } of workers) {
            const nodes = parentTag
                ? worker.getSubElements(parentTag, ancestorChain)
                : worker.getRootElements()
            results.push(...this.builder.buildElementCompletions(nodes, prefix))
        }
        return results
    }

    private attributeSuggestions(
        parentTag: string,
        workers: WorkerWithPrefix[],
        textUntilPosition: string,
    ): ICompletion[] {
        const usedAttrs = extractUsedAttributes(textUntilPosition)
        const results: ICompletion[] = []
        for (const { worker } of workers) {
            const attrs = worker.getAttributesForElement(parentTag)
            results.push(...this.builder.buildAttributeCompletions(attrs, usedAttrs))
        }
        return results
    }

    private attributeValueSuggestions(
        parentTag: string,
        workers: WorkerWithPrefix[],
        textUntilPosition: string,
    ): ICompletion[] {
        const attrName = extractCurrentAttributeName(textUntilPosition)
        if (!attrName) return []
        const results: ICompletion[] = []
        for (const { worker } of workers) {
            const values = worker.getEnumValuesForAttribute(parentTag, attrName)
            results.push(...this.builder.buildEnumCompletions(values))
        }
        return results
    }

    private closingTagSuggestions(parentTag: string): ICompletion[] {
        if (!parentTag) return []
        // Closing tag prefix cannot be reliably recovered from the stripped ancestor
        // stack — emit without prefix; EditorPlugin may enhance this later.
        return [this.builder.buildClosingTagCompletion(parentTag, '')]
    }
}
