import { describe, it, expect } from 'vitest'
import { SchemaParser } from './SchemaParser'
import type { IXsd } from '../types'

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeXsd(value: string): IXsd {
    return { path: 'test.xsd', value }
}

// ─── XSD fixtures ─────────────────────────────────────────────────────────────

/** Simple schema with two root elements, one with a named complexType. */
const ROOT_ELEMENTS_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="RootType">
    <xs:sequence>
      <xs:element name="Child" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="Root" type="RootType"/>
  <xs:element name="Other" type="xs:string"/>
</xs:schema>`)

/** Schema demonstrating context-aware resolution.
 *  Both "Inner" elements share the name but have different types depending on parent. */
const CONTEXT_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ChildAType">
    <xs:sequence>
      <xs:element name="Inner" type="InnerAType"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="ChildBType">
    <xs:sequence>
      <xs:element name="Inner" type="InnerBType"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="InnerAType">
    <xs:sequence>
      <xs:element name="LeafA" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="InnerBType">
    <xs:sequence>
      <xs:element name="LeafB" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="RootType">
    <xs:sequence>
      <xs:element name="ChildA" type="ChildAType"/>
      <xs:element name="ChildB" type="ChildBType"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="Root" type="RootType"/>
</xs:schema>`)

/** Schema with required and optional attributes. */
const ATTRIBUTES_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ItemType">
    <xs:sequence/>
    <xs:attribute name="id" type="xs:string" use="required"/>
    <xs:attribute name="label" type="xs:string"/>
  </xs:complexType>
  <xs:element name="Item" type="ItemType"/>
</xs:schema>`)

/** Schema with enum values on an attribute. */
const ENUM_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="ColorType">
    <xs:restriction base="xs:string">
      <xs:enumeration value="red"/>
      <xs:enumeration value="green"/>
      <xs:enumeration value="blue"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:complexType name="ShapeType">
    <xs:sequence/>
    <xs:attribute name="color" type="ColorType"/>
    <xs:attribute name="fill">
      <xs:simpleType>
        <xs:restriction base="xs:string">
          <xs:enumeration value="solid"/>
          <xs:enumeration value="none"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
  </xs:complexType>
  <xs:element name="Shape" type="ShapeType"/>
</xs:schema>`)

/** Schema with an inline (anonymous) complexType. */
const INLINE_CT_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Container">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Leaf" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`)

/** Schema with xs:extension (element that extends a named base type). */
const EXTENSION_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="BaseType">
    <xs:sequence>
      <xs:element name="BaseChild" type="xs:string"/>
    </xs:sequence>
    <xs:attribute name="baseAttr" type="xs:string"/>
  </xs:complexType>
  <xs:element name="Extended">
    <xs:complexType>
      <xs:complexContent>
        <xs:extension base="BaseType"/>
      </xs:complexContent>
    </xs:complexType>
  </xs:element>
</xs:schema>`)

/** Schema with a named xs:group used via ref. */
const GROUP_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="CommonGroup">
    <xs:sequence>
      <xs:element name="GroupChild" type="xs:string"/>
    </xs:sequence>
  </xs:group>
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:group ref="CommonGroup"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="Container" type="ContainerType"/>
</xs:schema>`)

/** Schema covering sequence / choice / all / simpleContent content model types. */
const CONTENT_MODEL_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="SeqType">
    <xs:sequence>
      <xs:element name="A" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="ChoiceType">
    <xs:choice>
      <xs:element name="B" type="xs:string"/>
      <xs:element name="C" type="xs:string"/>
    </xs:choice>
  </xs:complexType>
  <xs:complexType name="AllType">
    <xs:all>
      <xs:element name="D" type="xs:string"/>
    </xs:all>
  </xs:complexType>
  <xs:complexType name="SimpleType">
    <xs:simpleContent>
      <xs:extension base="xs:string">
        <xs:attribute name="unit" type="xs:string"/>
      </xs:extension>
    </xs:simpleContent>
  </xs:complexType>
  <xs:element name="SeqEl" type="SeqType"/>
  <xs:element name="ChoiceEl" type="ChoiceType"/>
  <xs:element name="AllEl" type="AllType"/>
  <xs:element name="SimpleEl" type="SimpleType"/>
</xs:schema>`)

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SchemaParser', () => {
    // 1. Root element listing
    describe('getRootElements', () => {
        it('returns all top-level xs:element declarations', () => {
            const parser = new SchemaParser(ROOT_ELEMENTS_XSD)
            const roots = parser.getRootElements()
            const names = roots.map(r => r.name)
            expect(names).toContain('Root')
            expect(names).toContain('Other')
        })

        it('attaches required attributes to root elements that have them', () => {
            const parser = new SchemaParser(ATTRIBUTES_XSD)
            const roots = parser.getRootElements()
            const item = roots.find(r => r.name === 'Item')
            expect(item).toBeDefined()
            expect(item?.requiredAttribute).toBeDefined()
            expect(item?.requiredAttribute?.map(a => a.name)).toContain('id')
        })
    })

    // 2. Sub-elements of a typed element
    describe('getSubElements', () => {
        it('returns child elements for a named complexType', () => {
            const parser = new SchemaParser(ROOT_ELEMENTS_XSD)
            const children = parser.getSubElements('Root')
            expect(children.map(c => c.name)).toContain('Child')
        })

        it('returns empty array for element with no complex type', () => {
            const parser = new SchemaParser(ROOT_ELEMENTS_XSD)
            const children = parser.getSubElements('Other')
            expect(children).toHaveLength(0)
        })
    })

    // 3. Context-aware resolution
    describe('getSubElements with ancestorChain', () => {
        it('resolves correct children when Inner is under ChildA', () => {
            const parser = new SchemaParser(CONTEXT_XSD)
            // ancestorChain = path from root down to direct parent of "Inner"
            const children = parser.getSubElements('Inner', ['Root', 'ChildA'])
            const names = children.map(c => c.name)
            expect(names).toContain('LeafA')
            expect(names).not.toContain('LeafB')
        })

        it('resolves correct children when Inner is under ChildB', () => {
            const parser = new SchemaParser(CONTEXT_XSD)
            const children = parser.getSubElements('Inner', ['Root', 'ChildB'])
            const names = children.map(c => c.name)
            expect(names).toContain('LeafB')
            expect(names).not.toContain('LeafA')
        })

        it('falls back to union when context does not match', () => {
            const parser = new SchemaParser(CONTEXT_XSD)
            // No ancestor chain — gets union of all types for "Inner"
            const children = parser.getSubElements('Inner')
            const names = children.map(c => c.name)
            expect(names).toContain('LeafA')
            expect(names).toContain('LeafB')
        })
    })

    // 4. Attribute listing including required flag
    describe('getAttributesForElement', () => {
        it('returns all attributes', () => {
            const parser = new SchemaParser(ATTRIBUTES_XSD)
            const attrs = parser.getAttributesForElement('Item')
            const names = attrs.map(a => a.name)
            expect(names).toContain('id')
            expect(names).toContain('label')
        })

        it('marks required attributes with use="required"', () => {
            const parser = new SchemaParser(ATTRIBUTES_XSD)
            const attrs = parser.getAttributesForElement('Item')
            const id = attrs.find(a => a.name === 'id')
            expect(id?.use).toBe('required')
            const label = attrs.find(a => a.name === 'label')
            expect(label?.use).toBeUndefined()
        })
    })

    // 5. Enum values for an attribute
    describe('getEnumValuesForAttribute', () => {
        it('returns enum values from a named simpleType', () => {
            const parser = new SchemaParser(ENUM_XSD)
            const values = parser.getEnumValuesForAttribute('Shape', 'color')
            expect(values).toEqual(['red', 'green', 'blue'])
        })

        it('returns enum values from an inline simpleType', () => {
            const parser = new SchemaParser(ENUM_XSD)
            const values = parser.getEnumValuesForAttribute('Shape', 'fill')
            expect(values).toEqual(['solid', 'none'])
        })

        it('returns empty array for non-enum attribute', () => {
            const parser = new SchemaParser(ATTRIBUTES_XSD)
            const values = parser.getEnumValuesForAttribute('Item', 'id')
            expect(values).toHaveLength(0)
        })
    })

    // 5b. getEnumValuesForNamedType
    describe('getEnumValuesForNamedType', () => {
        it('resolves named simpleType directly', () => {
            const parser = new SchemaParser(ENUM_XSD)
            const values = parser.getEnumValuesForNamedType('ColorType')
            expect(values).toEqual(['red', 'green', 'blue'])
        })

        it('returns empty array for unknown type name', () => {
            const parser = new SchemaParser(ENUM_XSD)
            expect(parser.getEnumValuesForNamedType('NonExistent')).toHaveLength(0)
        })
    })

    // 6. Inline complexType (anonymous __inline__ key)
    describe('inline complexType', () => {
        it('returns sub-elements for an element with an anonymous complexType', () => {
            const parser = new SchemaParser(INLINE_CT_XSD)
            const children = parser.getSubElements('Container')
            expect(children.map(c => c.name)).toContain('Leaf')
        })

        it('getFirstSubElements works for inline complexType', () => {
            const parser = new SchemaParser(INLINE_CT_XSD)
            const children = parser.getFirstSubElements('Container', false)
            expect(children.map(c => c.name)).toContain('Leaf')
        })
    })

    // 7. Extension chain (xs:extension base)
    describe('extension chain', () => {
        it('resolves element that extends a base type', () => {
            const parser = new SchemaParser(EXTENSION_XSD)
            const children = parser.getSubElements('Extended')
            expect(children.map(c => c.name)).toContain('BaseChild')
        })

        it('resolves attributes from the base type', () => {
            const parser = new SchemaParser(EXTENSION_XSD)
            const attrs = parser.getAttributesForElement('Extended')
            expect(attrs.map(a => a.name)).toContain('baseAttr')
        })
    })

    // 8. Group ref following (xs:group ref)
    describe('group ref', () => {
        it('follows xs:group ref to collect elements', () => {
            const parser = new SchemaParser(GROUP_XSD)
            const children = parser.getSubElements('Container')
            expect(children.map(c => c.name)).toContain('GroupChild')
        })

        it('getElementsFromGroup returns group children', () => {
            const parser = new SchemaParser(GROUP_XSD)
            const groupNode = { ref: 'CommonGroup' }
            const children = parser.getElementsFromGroup(groupNode)
            expect(children.map(c => c.name)).toContain('GroupChild')
        })
    })

    // 9. ContentModelType detection
    describe('getContentModelType', () => {
        it('detects sequence', () => {
            const parser = new SchemaParser(CONTENT_MODEL_XSD)
            expect(parser.getContentModelType('SeqEl')).toBe('sequence')
        })

        it('detects choice', () => {
            const parser = new SchemaParser(CONTENT_MODEL_XSD)
            expect(parser.getContentModelType('ChoiceEl')).toBe('choice')
        })

        it('detects all', () => {
            const parser = new SchemaParser(CONTENT_MODEL_XSD)
            expect(parser.getContentModelType('AllEl')).toBe('all')
        })

        it('detects simpleContent', () => {
            const parser = new SchemaParser(CONTENT_MODEL_XSD)
            expect(parser.getContentModelType('SimpleEl')).toBe('simpleContent')
        })

        it('returns null for element with no complex type', () => {
            const parser = new SchemaParser(ROOT_ELEMENTS_XSD)
            expect(parser.getContentModelType('Other')).toBeNull()
        })
    })

    // 10. getFirstSubElements — choice picks only first branch
    describe('getFirstSubElements', () => {
        it('returns only the first child of each xs:choice branch', () => {
            const parser = new SchemaParser(CONTENT_MODEL_XSD)
            const children = parser.getFirstSubElements('ChoiceEl', false)
            // Only B should be returned (first in the choice), not C
            const names = children.map(c => c.name)
            expect(names).toContain('B')
            expect(names).not.toContain('C')
        })

        it('returns all children for xs:sequence', () => {
            const parser = new SchemaParser(ROOT_ELEMENTS_XSD)
            const children = parser.getFirstSubElements('Root', false)
            expect(children.map(c => c.name)).toContain('Child')
        })

        it('attaches required attributes when withAttributes=true', () => {
            const parser = new SchemaParser(ATTRIBUTES_XSD)
            // Item's ComplexType has a sequence child; first subs with attrs
            // (no child elements here, but required attrs attach to Item itself)
            const roots = parser.getRootElements()
            const item = roots.find(r => r.name === 'Item')
            expect(item?.requiredAttribute?.map(a => a.name)).toContain('id')
        })
    })
})
