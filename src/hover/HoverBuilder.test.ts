import { describe, it, expect } from 'vitest'
import { HoverBuilder } from './HoverBuilder'
import type { DocumentNode } from '../types'

const builder = new HoverBuilder()

function node(overrides: Partial<DocumentNode>): DocumentNode {
    return { name: 'Tag', ...overrides }
}

describe('HoverBuilder', () => {
    describe('buildForElement', () => {
        it('node with type and no doc → header only', () => {
            const result = builder.buildForElement(node({ name: 'Root', type: 'RootType' }))
            expect(result).toBeDefined()
            expect(result!.value).toBe('**`Root`** *(RootType)*')
        })

        it('node with plain text doc → includes doc after header', () => {
            const result = builder.buildForElement(node({ name: 'Root', type: 'xs:string', documentation: 'The root element.' }))
            expect(result!.value).toContain('The root element.')
            expect(result!.value).toContain('**`Root`**')
        })

        it('node with HTML doc → converts to markdown', () => {
            const result = builder.buildForElement(node({ name: 'El', type: 'T', documentation: '<b>Bold</b>' }))
            expect(result!.value).toContain('**Bold**')
        })

        it('node with no type and no doc → undefined', () => {
            expect(builder.buildForElement(node({ name: 'Root' }))).toBeUndefined()
        })

        it('node with doc but no type → shows doc without type annotation', () => {
            const result = builder.buildForElement(node({ name: 'Root', documentation: 'Some doc.' }))
            expect(result).toBeDefined()
            expect(result!.value).not.toContain('*(')
            expect(result!.value).toContain('Some doc.')
        })
    })

    describe('buildForAttribute', () => {
        it('required attribute with type → includes required mark', () => {
            const result = builder.buildForAttribute(node({ name: 'id', type: 'xs:string', use: 'required' }))
            expect(result!.value).toContain('**required**')
            expect(result!.value).toContain('@id')
            expect(result!.value).toContain('xs:string')
        })

        it('optional attribute with doc → no required mark, includes doc', () => {
            const result = builder.buildForAttribute(node({ name: 'status', type: 'xs:string', use: 'optional', documentation: 'Status value.' }))
            expect(result!.value).not.toContain('required')
            expect(result!.value).toContain('Status value.')
        })

        it('node with no type, no use, no doc → undefined', () => {
            expect(builder.buildForAttribute(node({ name: 'x' }))).toBeUndefined()
        })

        it('HTML doc is converted to markdown', () => {
            const result = builder.buildForAttribute(node({ name: 'x', use: 'optional', documentation: '<em>Italic</em>' }))
            expect(result!.value).toContain('_Italic_')
        })
    })
})
