export const mimeTypes = ['text/x-mermaid'];
export const extensions = ['mmd', 'mermaid'];
export const cmLang = null; // no dedicated CM lang — plain text

export const example =
`flowchart TD
    A([Kofi submits PR\nAccra, Ghana]) --> B{Code review}
    B -->|approved| C[Merge to main]
    B -->|changes needed| D[Revise & resubmit]
    D --> B
    C --> E[CI pipeline]
    E -->|tests pass| F([Deploy to staging\nSingapore])
    E -->|tests fail| G[Notify Amara\nNairobi, Kenya]
    G --> D
    F --> H{QA sign-off}
    H -->|approved| I([Release\nSão Paulo, Brazil])
    H -->|rejected| G`;
