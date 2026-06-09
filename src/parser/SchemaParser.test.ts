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

/**
 * Schema where Parameter has ONLY attributes (no content model — no sequence/choice/
 * simpleContent). Elements like this should be self-closing in generated snippets
 * so the cursor never lands inside them after insertion.
 */
const ATTR_ONLY_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Parameters">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Parameter" type="ParameterType" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
  <xs:complexType name="ParameterType">
    <xs:attribute name="name" use="required" type="xs:string"/>
    <xs:attribute name="value" use="required" type="xs:string"/>
  </xs:complexType>
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

/**
 * Same element name (Block / Inner) appears with different concrete types
 * depending on ancestor context — exercises multi-typed context-aware resolution.
 */
const MULTI_TYPE_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="SectionA">
          <xs:complexType>
            <xs:choice>
              <xs:element name="Block" type="BlockTypeA"/>
            </xs:choice>
          </xs:complexType>
        </xs:element>
        <xs:element name="SectionB" type="SectionBType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>

  <xs:complexType name="SectionBType">
    <xs:choice>
      <xs:element name="Block" type="BlockTypeB"/>
    </xs:choice>
  </xs:complexType>

  <xs:complexType name="BlockTypeA">
    <xs:sequence>
      <xs:element name="Inner" type="InnerTypeA"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="BlockTypeB">
    <xs:sequence>
      <xs:element name="Inner" type="InnerTypeB"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="InnerTypeA">
    <xs:sequence>
      <xs:element name="LeafA" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="InnerTypeB">
    <xs:sequence>
      <xs:element name="LeafB" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>`)

/**
 * Three contexts share the same element names (CondBlock / Case) but each
 * context maps Case to a different concrete type with distinct children.
 * Mirrors the IfBlock/If multi-type pattern in the user's schema.
 */
const THREE_CONTEXT_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">

  <!-- Root element with three child contexts (inline CTs) -->
  <xs:element name="Root">
    <xs:complexType>
      <xs:sequence>
        <!-- FlowA: CondBlock maps to CondBlockTypeA, Case → CaseTypeA (only ActionA) -->
        <xs:element name="FlowA">
          <xs:complexType>
            <xs:choice>
              <xs:element name="Series" type="SeriesType"/>
              <xs:element name="CondBlock" type="CondBlockTypeA"/>
            </xs:choice>
          </xs:complexType>
        </xs:element>
        <!-- FlowB: CondBlock maps to CondBlockTypeB, Case → CaseTypeB (Signal + Scale + Wait) -->
        <xs:element name="FlowB">
          <xs:complexType>
            <xs:choice>
              <xs:element name="Series" type="SeriesType"/>
              <xs:element name="CondBlock" type="CondBlockTypeB"/>
            </xs:choice>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>

  <!-- SeriesType: its own CondBlock maps to CondBlockTypeC -->
  <xs:complexType name="SeriesType">
    <xs:choice>
      <xs:element name="Signal" type="xs:string"/>
      <xs:element name="CondBlock" type="CondBlockTypeC"/>
    </xs:choice>
  </xs:complexType>

  <xs:complexType name="CondBlockTypeA">
    <xs:sequence>
      <xs:element name="Case" type="CaseTypeA"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="CondBlockTypeB">
    <xs:sequence>
      <xs:element name="Case" type="CaseTypeB"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="CondBlockTypeC">
    <xs:sequence>
      <xs:element name="Case" type="CaseTypeC"/>
    </xs:sequence>
  </xs:complexType>

  <!-- CaseTypeA: only ActionA -->
  <xs:complexType name="CaseTypeA">
    <xs:sequence>
      <xs:element name="ActionA" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>

  <!-- CaseTypeB: Signal + Scale + Wait -->
  <xs:complexType name="CaseTypeB">
    <xs:choice>
      <xs:element name="Signal" type="xs:string"/>
      <xs:element name="Scale"  type="xs:string"/>
      <xs:element name="Wait"   type="xs:float"/>
    </xs:choice>
  </xs:complexType>

  <!-- CaseTypeC: SignalCycle + Scale -->
  <xs:complexType name="CaseTypeC">
    <xs:choice>
      <xs:element name="SignalCycle" type="xs:string"/>
      <xs:element name="Scale"      type="xs:string"/>
    </xs:choice>
  </xs:complexType>
</xs:schema>`)

/**
 * Schema where Parameter appears under two parents with completely different
 * attribute sets:
 *   <Parameters><Parameter name value />          — ParameterType (name, value)
 *   <Methods><Method><Parameters><Parameter type name value /> — MethodParameterType (type, name, value)
 */
const AMBIGUOUS_ATTR_XSD = makeXsd(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Parameters" type="ParametersType"/>
        <xs:element name="Methods"    type="MethodsType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>

  <xs:complexType name="ParametersType">
    <xs:sequence>
      <xs:element name="Parameter" type="ParameterType" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="ParameterType">
    <xs:attribute name="name"  use="required" type="xs:string"/>
    <xs:attribute name="value" use="required" type="xs:string"/>
  </xs:complexType>

  <xs:complexType name="MethodsType">
    <xs:sequence>
      <xs:element name="Method" type="MethodType"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="MethodType">
    <xs:sequence>
      <xs:element name="Parameters" type="MethodParametersType"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="MethodParametersType">
    <xs:sequence>
      <xs:element name="Parameter" type="MethodParameterType" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="MethodParameterType">
    <xs:attribute name="type"  use="required">
      <xs:simpleType>
        <xs:restriction base="xs:string">
          <xs:enumeration value="boolean"/>
          <xs:enumeration value="integer"/>
          <xs:enumeration value="string"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
    <xs:attribute name="name"  use="required" type="xs:string"/>
    <xs:attribute name="value" use="required" type="xs:string"/>
  </xs:complexType>
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
        // Same element name (Block/Inner) with different types per context
        it('resolves Block under SectionA to BlockTypeA children', () => {
            const parser = new SchemaParser(MULTI_TYPE_XSD)
            const children = parser.getSubElements('Block', ['Root', 'SectionA'])
            const names = children.map(c => c.name)
            expect(names).toContain('Inner')
        })

        it('resolves Inner deep in Root/SectionA/Block to LeafA only', () => {
            const parser = new SchemaParser(MULTI_TYPE_XSD)
            const children = parser.getSubElements('Inner', ['Root', 'SectionA', 'Block'])
            const names = children.map(c => c.name)
            expect(names).toContain('LeafA')
            expect(names).not.toContain('LeafB')
        })

        it('resolves Inner in Root/SectionB/Block context to LeafB only', () => {
            const parser = new SchemaParser(MULTI_TYPE_XSD)
            const children = parser.getSubElements('Inner', ['Root', 'SectionB', 'Block'])
            const names = children.map(c => c.name)
            expect(names).toContain('LeafB')
            expect(names).not.toContain('LeafA')
        })

        it('falls back to union of both leaf types when no ancestor chain given', () => {
            const parser = new SchemaParser(MULTI_TYPE_XSD)
            const children = parser.getSubElements('Inner')
            const names = children.map(c => c.name)
            expect(names).toContain('LeafA')
            expect(names).toContain('LeafB')
        })

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

        // Three-context IfBlock-mirror tests
        it('three-context: Case under FlowA/CondBlock returns only ActionA', () => {
            const parser = new SchemaParser(THREE_CONTEXT_XSD)
            const names = parser.getSubElements('Case', ['Root', 'FlowA', 'CondBlock']).map(c => c.name)
            expect(names).toEqual(['ActionA'])
        })

        it('three-context: Case under FlowB/CondBlock returns only Signal+Scale+Wait', () => {
            const parser = new SchemaParser(THREE_CONTEXT_XSD)
            const names = parser.getSubElements('Case', ['Root', 'FlowB', 'CondBlock']).map(c => c.name)
            expect(names).toContain('Signal')
            expect(names).toContain('Scale')
            expect(names).toContain('Wait')
            expect(names).not.toContain('ActionA')
            expect(names).not.toContain('SignalCycle')
        })

        it('three-context: Case under FlowA/Series/CondBlock returns only SignalCycle+Scale', () => {
            const parser = new SchemaParser(THREE_CONTEXT_XSD)
            const names = parser.getSubElements('Case', ['Root', 'FlowA', 'Series', 'CondBlock']).map(c => c.name)
            expect(names).toContain('SignalCycle')
            expect(names).toContain('Scale')
            expect(names).not.toContain('ActionA')
            expect(names).not.toContain('Signal')
        })

        it('three-context: no ancestor chain returns union of all Case children', () => {
            const parser = new SchemaParser(THREE_CONTEXT_XSD)
            const names = parser.getSubElements('Case').map(c => c.name)
            expect(names).toContain('ActionA')
            expect(names).toContain('Signal')
            expect(names).toContain('SignalCycle')
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

    // 8b. selfClose flag for attribute-only elements
    describe('selfClose flag', () => {
        it('sets selfClose on element whose complexType has only attributes (no content model)', () => {
            const parser = new SchemaParser(ATTR_ONLY_XSD)
            const children = parser.getSubElements('Parameters')
            const param = children.find(c => c.name === 'Parameter')
            expect(param?.selfClose).toBe(true)
        })

        it('does not set selfClose on element with xs:sequence', () => {
            const parser = new SchemaParser(ATTR_ONLY_XSD)
            const roots = parser.getRootElements()
            const parameters = roots.find(r => r.name === 'Parameters')
            expect(parameters?.selfClose).toBeUndefined()
        })

        it('sets selfClose on element with xs:simpleContent', () => {
            const parser = new SchemaParser(CONTENT_MODEL_XSD)
            const roots = parser.getRootElements()
            const simpleEl = roots.find(r => r.name === 'SimpleEl')
            expect(simpleEl?.selfClose).toBe(true)
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

    // 11. Context-aware attribute resolution
    describe('getAttributesForElement with ancestor chain', () => {
        it('Parameter under Root/Parameters resolves to ParameterType (name, value only)', () => {
            const parser = new SchemaParser(AMBIGUOUS_ATTR_XSD)
            const attrs = parser.getAttributesForElement('Parameter', ['Root', 'Parameters'])
            const names = attrs.map(a => a.name)
            expect(names).toContain('name')
            expect(names).toContain('value')
            expect(names).not.toContain('type')
        })

        it('Parameter under Root/Methods/Method/Parameters resolves to MethodParameterType (type, name, value)', () => {
            const parser = new SchemaParser(AMBIGUOUS_ATTR_XSD)
            const attrs = parser.getAttributesForElement('Parameter', ['Root', 'Methods', 'Method', 'Parameters'])
            const names = attrs.map(a => a.name)
            expect(names).toContain('type')
            expect(names).toContain('name')
            expect(names).toContain('value')
        })

        it('without ancestor chain returns union of all Parameter attributes', () => {
            const parser = new SchemaParser(AMBIGUOUS_ATTR_XSD)
            const attrs = parser.getAttributesForElement('Parameter')
            const names = attrs.map(a => a.name)
            expect(names).toContain('name')
            expect(names).toContain('value')
        })

        it('getEnumValuesForAttribute returns enum only for MethodParameter.type in correct context', () => {
            const parser = new SchemaParser(AMBIGUOUS_ATTR_XSD)
            const withContext = parser.getEnumValuesForAttribute('Parameter', 'type', ['Root', 'Methods', 'Method', 'Parameters'])
            expect(withContext).toContain('boolean')
            expect(withContext).toContain('integer')
            expect(withContext).toContain('string')
        })

        it('getEnumValuesForAttribute returns empty for Parameter.type in wrong context', () => {
            const parser = new SchemaParser(AMBIGUOUS_ATTR_XSD)
            const withContext = parser.getEnumValuesForAttribute('Parameter', 'type', ['Root', 'Parameters'])
            expect(withContext).toHaveLength(0)
        })
    })
})
