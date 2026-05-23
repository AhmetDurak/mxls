import { describe, it, expect } from 'vitest'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import { CompletionBuilder } from './CompletionBuilder'
import type { DocumentNode } from '../types'

const mockApi = {
    Range: class {
        constructor(_sl: number, _sc: number, _el: number, _ec: number) {}
    },
    KeyCode: { KeyF: 0, KeyG: 0, Escape: 0 },
    KeyMod: { CtrlCmd: 0, Shift: 0, Alt: 0, WinCtrl: 0 },
    languages: {
        CompletionItemKind: { Property: 9, Field: 3, Enum: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
        registerCompletionItemProvider: () => ({ dispose: () => {} }),
    },
    editor: { MarkerSeverity: {} },
} as unknown as IMonacoApi

const builder = new CompletionBuilder(mockApi)

// shorthand kinds
const Property = 9
const Field = 3
const Enum = 13
const InsertAsSnippet = 4

function node(overrides: Partial<DocumentNode>): DocumentNode {
    return { name: 'Tag', ...overrides }
}

describe('CompletionBuilder', () => {
    describe('buildElements', () => {
        it('basic snippet without NS prefix', () => {
            const [item] = builder.buildElements([node({ name: 'Root' })], undefined, false, false)
            expect(item.label).toBe('Root')
            expect(item.kind).toBe(Property)
            expect(item.insertText).toBe('<Root>${1}</Root>')
            expect(item.insertTextRules).toBe(InsertAsSnippet)
        })

        it('with namespace prefix → label and snippet prefixed', () => {
            const [item] = builder.buildElements([node({ name: 'Root' })], 'ns', false, false)
            expect(item.label).toBe('ns:Root')
            expect(item.insertText).toBe('<ns:Root>${1}</ns:Root>')
        })

        it('selfClose node → self-closing snippet', () => {
            const [item] = builder.buildElements([node({ name: 'Br', selfClose: true })], undefined, false, false)
            expect(item.insertText).toBe('<Br/>')
        })

        it('required attributes appear in snippet', () => {
            const [item] = builder.buildElements(
                [node({ name: 'Root', requiredAttribute: [{ name: 'id' }, { name: 'type' }] })],
                undefined, false, false,
            )
            expect(item.insertText).toBe('<Root id="${1}" type="${2}">${3}</Root>')
        })

        it('incomplete mode → plain label as insertText, no insertTextRules', () => {
            const [item] = builder.buildElements([node({ name: 'Root' })], undefined, false, true)
            expect(item.insertText).toBe('Root')
            expect(item.insertTextRules).toBeUndefined()
        })

        it('withoutTag mode → no leading "<" in snippet', () => {
            const [item] = builder.buildElements([node({ name: 'Root' })], undefined, true, false)
            expect(item.insertText).toBe('Root>${1}</Root>')
        })
    })

    describe('buildAttributes', () => {
        it('optional attribute → snippet with ="$0"', () => {
            const [item] = builder.buildAttributes([node({ name: 'myAttr', use: 'optional' })], false)
            expect(item.label).toBe('myAttr')
            expect(item.kind).toBe(Field)
            expect(item.insertText).toBe('myAttr="$0"')
            expect(item.insertTextRules).toBe(InsertAsSnippet)
            expect(item.preselect).toBe(false)
        })

        it('required attribute → preselect=true', () => {
            const [item] = builder.buildAttributes([node({ name: 'id', use: 'required' })], false)
            expect(item.preselect).toBe(true)
        })

        it('incomplete mode → plain name, no insertTextRules', () => {
            const [item] = builder.buildAttributes([node({ name: 'myAttr' })], true)
            expect(item.insertText).toBe('myAttr')
            expect(item.insertTextRules).toBeUndefined()
        })

        it('HTML documentation is converted to markdown', () => {
            const [item] = builder.buildAttributes(
                [node({ name: 'x', documentation: '<b>Bold</b>' })],
                false,
            )
            expect(item.documentation).toEqual({ value: '**Bold**' })
        })
    })

    describe('buildAttributeValues', () => {
        it('empty list → []', () => {
            expect(builder.buildAttributeValues([])).toEqual([])
        })

        it('two values → two Enum items', () => {
            const items = builder.buildAttributeValues(['true', 'false'])
            expect(items).toHaveLength(2)
            expect(items[0]).toMatchObject({ label: 'true', kind: Enum, insertText: 'true' })
            expect(items[1]).toMatchObject({ label: 'false', kind: Enum, insertText: 'false' })
        })
    })

    describe('buildClosingTag', () => {
        it('simple tag → "/Root>"', () => {
            const item = builder.buildClosingTag('Root')
            expect(item.label).toBe('/Root>')
            expect(item.insertText).toBe('/Root>')
            expect(item.kind).toBe(Property)
        })

        it('namespaced tag → includes prefix', () => {
            const item = builder.buildClosingTag('ns:Root')
            expect(item.label).toBe('/ns:Root>')
            expect(item.insertText).toBe('/ns:Root>')
        })
    })
})
