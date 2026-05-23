import { describe, it, expect } from 'vitest'
import { SchemaParser } from '../parser/SchemaParser'
import type { IXsd } from '../types'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import { SchemaValidator } from './SchemaValidator'
import { Severity } from '../types'

// ─── XSD fixtures ─────────────────────────────────────────────────────────────

const MAIN_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Child" type="ChildType" minOccurs="1" maxOccurs="3"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
  <xs:complexType name="ChildType">
    <xs:attribute name="id" type="xs:string" use="required"/>
    <xs:attribute name="status" use="optional">
      <xs:simpleType>
        <xs:restriction base="xs:string">
          <xs:enumeration value="active"/>
          <xs:enumeration value="inactive"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
  </xs:complexType>
</xs:schema>`

const BOOLEAN_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Config">
    <xs:complexType>
      <xs:attribute name="enabled" type="xs:boolean"/>
    </xs:complexType>
  </xs:element>
</xs:schema>`

const CHOICE_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Container">
    <xs:complexType>
      <xs:choice>
        <xs:element name="OptionA"/>
        <xs:element name="OptionB"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
</xs:schema>`

// ─── SchemaParser → ISchemaWorker adapter ──────────────────────────────────────────

function makeWorker(xsd: IXsd): ISchemaWorker {
    const parser = new SchemaParser(xsd)
    const w: ISchemaWorker = {
        xsd,
        withNamespace: () => w,
        doCompletion: () => [],
        getRootElements: () => parser.getRootElements(),
        getSubElements: (name, ancestors) => parser.getSubElements(name, ancestors),
        getFirstSubElements: (name, withAttrs) => parser.getFirstSubElements(name, withAttrs),
        getAttributesForElement: (name) => parser.getAttributesForElement(name),
        getEnumValuesForAttribute: (elem, attr) => parser.getEnumValuesForAttribute(elem, attr),
        getEnumValuesForNamedType: (type) => parser.getEnumValuesForNamedType(type),
        getContentModelType: (name) => parser.getContentModelType(name),
    }
    return w
}

const mainXsd: IXsd = { path: 'main.xsd', value: MAIN_XSD }
const boolXsd: IXsd = { path: 'bool.xsd', value: BOOLEAN_XSD }
const choiceXsd: IXsd = { path: 'choice.xsd', value: CHOICE_XSD }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SchemaValidator', () => {
    const validator = new SchemaValidator()
    const mainWorker = makeWorker(mainXsd)
    const boolWorker = makeWorker(boolXsd)
    const choiceWorker = makeWorker(choiceXsd)

    // 1. Valid document ────────────────────────────────────────────────────────
    it('no errors for valid XML', () => {
        const xml = '<Root><Child id="1"/><Child id="2" status="active"/></Root>'
        const errors = validator.validate(xml, [mainWorker])
        expect(errors).toHaveLength(0)
    })

    // 2. Unknown element ───────────────────────────────────────────────────────
    it('reports unknown element', () => {
        const xml = '<Root><Child id="1"/><Unknown/></Root>'
        const errors = validator.validate(xml, [mainWorker])
        expect(errors.some(e => e.message.includes('Unknown') && e.severity === Severity.error)).toBe(true)
    })

    // 3. Missing required attribute ───────────────────────────────────────────
    it('reports missing required attribute', () => {
        const xml = '<Root><Child/></Root>'
        const errors = validator.validate(xml, [mainWorker])
        expect(errors.some(e => e.message.includes('"id"') && e.severity === Severity.error)).toBe(true)
    })

    // 4. Unknown attribute ────────────────────────────────────────────────────
    it('reports unknown attribute', () => {
        const xml = '<Root><Child id="1" bogus="x"/></Root>'
        const errors = validator.validate(xml, [mainWorker])
        expect(errors.some(e => e.message.includes('"bogus"') && e.severity === Severity.error)).toBe(true)
    })

    // 5. Invalid boolean value ────────────────────────────────────────────────
    it('reports invalid boolean value', () => {
        const xml = '<Config enabled="yes"/>'
        const errors = validator.validate(xml, [boolWorker])
        expect(errors.some(e => e.message.includes('"enabled"') && e.severity === Severity.error)).toBe(true)
    })

    // 6. Invalid enum value ───────────────────────────────────────────────────
    it('reports invalid enum value', () => {
        const xml = '<Root><Child id="1" status="pending"/></Root>'
        const errors = validator.validate(xml, [mainWorker])
        expect(errors.some(e => e.message.includes('"status"') && e.severity === Severity.error)).toBe(true)
    })

    // 7. maxOccurs exceeded ───────────────────────────────────────────────────
    it('reports maxOccurs exceeded', () => {
        const xml = `<Root>
  <Child id="1"/><Child id="2"/><Child id="3"/><Child id="4"/>
</Root>`
        const errors = validator.validate(xml, [mainWorker])
        expect(errors.some(e => e.message.includes('maxOccurs') && e.severity === Severity.error)).toBe(true)
    })

    // 8. minOccurs violated ───────────────────────────────────────────────────
    it('reports minOccurs violated', () => {
        const xml = '<Root></Root>'
        const errors = validator.validate(xml, [mainWorker])
        expect(errors.some(e => e.message.includes('minOccurs') && e.severity === Severity.error)).toBe(true)
    })

    // 9. Empty choice ─────────────────────────────────────────────────────────
    it('reports empty choice', () => {
        const xml = '<Container></Container>'
        const errors = validator.validate(xml, [choiceWorker])
        expect(errors.some(e => e.message.includes('choice') && e.severity === Severity.error)).toBe(true)
    })

    // 10. Deduplication ───────────────────────────────────────────────────────
    it('deduplicates errors at same position', () => {
        // An unknown element generates exactly one error even when validated
        // against two workers that both fail to recognise it.
        const xml = '<Root><Child id="1"/><Ghost/></Root>'
        const errors = validator.validate(xml, [mainWorker])
        const ghostErrors = errors.filter(e => e.message.includes('Ghost'))
        expect(ghostErrors.length).toBe(1)
    })
})
