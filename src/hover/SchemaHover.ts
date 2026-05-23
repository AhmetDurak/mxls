import type { editor, languages, IRange } from 'monaco-editor'
import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import { TextAnalyzer } from '../completion/TextAnalyzer'
import { HoverBuilder } from './HoverBuilder'

/** Monaco hover provider — resolves schema doc for the element or attribute under cursor. */
export class SchemaHover {
    private readonly analyzer = new TextAnalyzer()
    private readonly hoverBuilder = new HoverBuilder()

    constructor(private readonly registry: ISchemaRegistry) {}

    provider(): languages.HoverProvider {
        return {
            provideHover: (model, position) => this.provideHover(model, position),
        }
    }

    private provideHover(
        model: editor.ITextModel,
        position: { lineNumber: number; column: number },
    ): languages.Hover | null {
        const word = model.getWordAtPosition(position)
        if (!word) return null

        const wordRange: IRange = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
        }

        // Text from doc start up to the beginning of the hovered word
        const textToWord = model.getValueInRange({
            startLineNumber: 1, startColumn: 1,
            endLineNumber: position.lineNumber, endColumn: word.startColumn,
        })

        // Text from doc start up to cursor (for inside-open-tag detection)
        const textToCursor = model.getValueInRange({
            startLineNumber: 1, startColumn: 1,
            endLineNumber: position.lineNumber, endColumn: position.column,
        })

        const ancestors = this.analyzer.getAncestorChain(textToWord)
        const parentAtWord = this.analyzer.getParentTag(textToWord)

        // Element name hover: text before word ends with < or </
        if (/[<\/]\s*$/.test(textToWord)) {
            const tagName = word.word
            for (const worker of this.registry.getAllWorkers()) {
                const candidates = parentAtWord
                    ? worker.getSubElements(parentAtWord, ancestors)
                    : worker.getRootElements()
                const match = candidates.find(e => e.name === tagName)
                if (match) {
                    const content = this.hoverBuilder.buildForElement(match)
                    if (content) return { contents: [content], range: wordRange }
                }
            }
            return null
        }

        // Attribute name hover: cursor is inside an open tag
        if (this.analyzer.isInsideOpenTag(textToCursor) && parentAtWord) {
            const attrName = word.word
            for (const worker of this.registry.getAllWorkers()) {
                const attrs = worker.getAttributesForElement(parentAtWord)
                const match = attrs.find(a => a.name === attrName)
                if (match) {
                    const content = this.hoverBuilder.buildForAttribute(match)
                    if (content) return { contents: [content], range: wordRange }
                }
            }
            return null
        }

        return null
    }
}
