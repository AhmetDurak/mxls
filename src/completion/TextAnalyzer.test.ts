import { describe, it, expect } from 'vitest'
import { TextAnalyzer } from './TextAnalyzer'
import { CompletionType } from '../types'

const analyzer = new TextAnalyzer()

describe('TextAnalyzer', () => {
    describe('getCompletionType', () => {
        it('triggerChar="<" on plain text → element', () => {
            expect(analyzer.getCompletionType('<Root', 1, '<')).toBe(CompletionType.element)
        })

        it('triggerChar="<" after "</" → closingElement', () => {
            expect(analyzer.getCompletionType('<Root></Root></', 1, '<')).toBe(CompletionType.closingElement)
        })

        it('triggerChar="/" → closingElement', () => {
            expect(analyzer.getCompletionType('<Root>', 1, '/')).toBe(CompletionType.closingElement)
        })

        it('triggerChar="=" → attributeValue', () => {
            expect(analyzer.getCompletionType('<Root attr=', 1, '=')).toBe(CompletionType.attributeValue)
        })

        it('triggerChar=\'"\' → attributeValue', () => {
            expect(analyzer.getCompletionType('<Root attr="', 1, '"')).toBe(CompletionType.attributeValue)
        })

        it("triggerChar=\"'\" → attributeValue", () => {
            expect(analyzer.getCompletionType("<Root attr='", 1, "'")).toBe(CompletionType.attributeValue)
        })

        it('triggerChar=" " inside open tag → incompleteAttribute', () => {
            expect(analyzer.getCompletionType('<Root ', 1, ' ')).toBe(CompletionType.incompleteAttribute)
        })

        it('triggerKind=0 with cursor mid-attribute-name → incompleteAttribute', () => {
            expect(analyzer.getCompletionType('<Root attr', 0)).toBe(CompletionType.incompleteAttribute)
        })

        it('triggerKind=0 after closed tag → element', () => {
            expect(analyzer.getCompletionType('<Root></Root>', 0)).toBe(CompletionType.element)
        })
    })

    describe('getParentTag', () => {
        it('empty text → undefined', () => {
            expect(analyzer.getParentTag('')).toBeUndefined()
        })

        it('single open tag → tag name', () => {
            expect(analyzer.getParentTag('<Root>')).toBe('Root')
        })

        it('namespaced tag → strips prefix', () => {
            expect(analyzer.getParentTag('<ns:Root>')).toBe('Root')
        })

        it('nested tags → innermost', () => {
            expect(analyzer.getParentTag('<Root><Child>')).toBe('Child')
        })
    })

    describe('getAncestorChain', () => {
        it('no tags → []', () => {
            expect(analyzer.getAncestorChain('')).toEqual([])
        })

        it('single root → []', () => {
            expect(analyzer.getAncestorChain('<Root>')).toEqual([])
        })

        it('three levels → all but innermost', () => {
            expect(analyzer.getAncestorChain('<Root><Parent><Child>')).toEqual(['Root', 'Parent'])
        })
    })

    describe('isInsideOpenTag', () => {
        it('after closed tag → false', () => {
            expect(analyzer.isInsideOpenTag('<Root>')).toBe(false)
        })

        it('inside open tag with trailing space → true', () => {
            expect(analyzer.isInsideOpenTag('<Root ')).toBe(true)
        })

        it('inside attribute value → true', () => {
            expect(analyzer.isInsideOpenTag('<Root attr="val')).toBe(true)
        })

        it('empty text → false', () => {
            expect(analyzer.isInsideOpenTag('')).toBe(false)
        })
    })

    describe('getCurrentOpenTagName', () => {
        it('empty text → undefined', () => {
            expect(analyzer.getCurrentOpenTagName('')).toBeUndefined()
        })

        it('after closed tag → undefined', () => {
            expect(analyzer.getCurrentOpenTagName('<Root>')).toBeUndefined()
        })

        it('cursor inside unclosed opening tag → tag name', () => {
            expect(analyzer.getCurrentOpenTagName('<Parameter ')).toBe('Parameter')
        })

        it('cursor inside attribute value of unclosed tag → tag name', () => {
            expect(analyzer.getCurrentOpenTagName('<Parameter name="')).toBe('Parameter')
        })

        it('namespaced tag → strips prefix', () => {
            expect(analyzer.getCurrentOpenTagName('<ns:Root attr="')).toBe('Root')
        })

        it('closing tag → undefined', () => {
            expect(analyzer.getCurrentOpenTagName('<Root></Root></')).toBeUndefined()
        })

        it('nested: cursor inside inner open tag → inner name', () => {
            expect(analyzer.getCurrentOpenTagName('<Root><Parameters><Parameter name="')).toBe('Parameter')
        })
    })

    describe('getAttrNameBeforeCursor', () => {
        it('no attribute value open → undefined', () => {
            expect(analyzer.getAttrNameBeforeCursor('<Root ')).toBeUndefined()
        })

        it('double-quoted open value → returns attr name', () => {
            expect(analyzer.getAttrNameBeforeCursor('<Root myAttr="')).toBe('myAttr')
        })

        it('single-quoted open value → returns attr name', () => {
            expect(analyzer.getAttrNameBeforeCursor("<Root myAttr='")).toBe('myAttr')
        })

        it('two attrs → returns the last open one', () => {
            expect(analyzer.getAttrNameBeforeCursor('<Root a="x" b="')).toBe('b')
        })
    })
})
