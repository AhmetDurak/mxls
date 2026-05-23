# mxls — Monaco XML Language Support

schema-driven autocomplete, real-time validation, template generation, and code formatting for the Monaco editor. Framework-agnostic — works with Angular, React, Vue, or vanilla JS.

---

## Features

| Feature | Description |
|---|---|
| **Element completion** | Suggests child elements based on the XSD schema for the current parent tag |
| **Attribute completion** | Suggests valid attributes for any open tag |
| **Attribute value completion** | Suggests enum values when the cursor is inside `attr="..."` |
| **Closing tag completion** | Suggests `</Tag>` for the nearest unclosed element |
| **maxOccurs enforcement** | Hides elements from suggestions once they reach their schema-defined occurrence limit |
| **Context-aware completion** | Resolves the correct element type when the same element name appears with different types in different parent contexts |
| **Cross-XSD type resolution** | Resolves enum values defined in a different XSD than the element |
| **Real-time validation** | Underlines unknown elements, missing required attributes, wrong attribute values, and occurrence violations |
| **Hover messages** | Explains each validation error on hover |
| **Template generation** | Generates an XML skeleton from the XSD up to a configurable nesting depth |
| **Code formatting** | Reformats XML via Prettier |
| **Dynamic namespace schemas** | Fetches and registers XSD schemas for `xmlns:prefix="uri"` declarations at runtime |

---

## Installation

```bash
npm install mxls monaco-editor @xmldom/xmldom ts-debounce prettier
```

Add squiggle styles (or `@import 'mxls/style.css'`):

```css
.xml-lint { border-width: 0; border-style: dotted; border-bottom-width: 3px; }
.xml-lint--fatal-error { border-color: red; }
.xml-lint--error       { border-color: orange; }
.xml-lint--warning     { border-color: blue; }
```

---

## Quick Start

```typescript
import { SchemaRegistry, EditorPlugin } from 'mxls'
import type { IMonacoApi } from 'mxls'

function initEditor(editor: monaco.editor.IStandaloneCodeEditor, monacoApi: IMonacoApi): void {
    const xsdManager = new SchemaRegistry()

    xsdManager.set({
        path: 'my-schema.xsd',
        value: MY_XSD_STRING,
        alwaysInclude: true,
    })

    const features = new EditorPlugin(xsdManager, monacoApi, editor)
    features.addCompletion()
    features.addValidation()
    features.addReformatAction()
    features.addGenerateAction()
}
```

**Angular:**
```typescript
onEditorInit(editor: any): void {
    initEditor(editor, (window as any).monaco)
}
```

**React:**
```tsx
<Editor language="xml" onMount={(editor, monaco) => initEditor(editor, monaco)} />
```

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Autocomplete | `Ctrl+Space` |
| Reformat code | `Ctrl+Shift+F` |
| Generate template | `Ctrl+Shift+G` |

All actions also appear in the right-click context menu.

---

## Validation Errors

- **Unknown element** — tag not defined in the XSD for its parent
- **Missing required attribute** — `use="required"` attribute absent
- **Unknown attribute** — attribute not declared in the XSD
- **Invalid boolean** — xs:boolean attribute with value outside {true, false, 1, 0}
- **Invalid enum value** — value not in xs:enumeration list
- **maxOccurs exceeded** — child element appears too many times
- **minOccurs violated** — required child element missing
- **Empty choice** — xs:choice element has no children

---

## Dependencies

| Package | Role |
|---|---|
| `monaco-editor` | TypeScript types only |
| `@xmldom/xmldom` | XML/XSD DOM parsing |
| `ts-debounce` | Debounces validation on keydown |
| `prettier` + `prettier/plugins/html` | XML reformatting |
| `turndown` | HTML → Markdown for documentation hovers |
