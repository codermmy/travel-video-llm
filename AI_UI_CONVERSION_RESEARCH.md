# AI UI Conversion: Direct HTML/CSS vs. Parametric Extraction

Based on current research, **extracting a parametric design language (tokens/rules) from HTML/CSS before AI generation is highly recommended over direct code-to-code translation**, particularly for React Native/mobile app targets. 

Direct translation of HTML/CSS to native UI by general-purpose LLMs suffers from consistent, predictable failure modes because web paradigms do not map cleanly to native rendering engines.

## 1. Failure Modes of Direct HTML/CSS to Native UI

When an AI model attempts to read HTML/CSS and directly output React Native code without structured context, several failure modes occur:

*   **Web Paradigm Hallucinations:** AI models trained heavily on web code will reflexively use CSS properties that don't exist in native renderers (e.g., `display: grid`, specific flexbox shorthand behaviors, `space-x` or `space-y` utilities).
*   **Structural Mismatches:** HTML relies on nested `div`s and CSS cascade. React Native requires strict primitives (`View`, `Text`, `SafeAreaView`) and doesn't support CSS inheritance. AI often attempts to nest native components in web-like ways that crash Metro bundlers.
*   **"Screenshot-to-Code" Blindness:** If using visual interpretation of HTML, the AI misses the behavioral context. It generates static layouts but misses hover states, responsive breakpoints, and the underlying data flow.
*   **Navigation & Lifecycle Errors:** Web routing (URLs/anchors) doesn't map to native stack/tab navigators. Direct translation often results in broken navigation patterns or improper handling of native lifecycles (like `KeyboardAvoidingView` or `SafeAreaView` insets).
*   **Context Fragmentation:** AI models lose the global project context. They don't know the specific file structure (e.g., Expo Router conventions vs. bare React Native) or existing component libraries, leading to hallucinated imports that cause build failures.

## 2. Pros & Cons of the Parametric Approach

**Pros:**
*   **High Fidelity & Consistency:** By extracting the "truth" of the design system (colors, typography scales, spacing), the generated UI adheres strictly to the brand guidelines rather than the AI guessing values on a component-by-component basis.
*   **Target-Agnostic Generation:** Once you have a structured JSON/token file, it can reliably constrain generation for React Native, Swift, or Kotlin. The AI is applying rules, not translating syntax.
*   **Maintainability:** The output is tied to a central theme file. If the brand color changes, you update the token, not 50 generated UI files.
*   **Reduced Hallucinations:** Passing structured tokens and strict constraints (e.g., "Use only these spacing tokens. Never use Grid.") as system prompts dramatically improves the compile rate of the generated code.

**Cons:**
*   **Upfront Setup Cost:** Requires building an extraction pipeline or manually identifying and cataloging the tokens from the HTML/CSS mocks.
*   **Loss of Unique One-Offs:** If a specific HTML component uses a highly custom, non-tokenized CSS animation or layout hack, the parametric approach might normalize it into the closest token, losing that specific nuance.

## 3. What Artifacts to Extract

To build an effective parametric context for the AI, extract the following from the `design-spec/` HTML/CSS:

1.  **Design Tokens (Primitives):**
    *   **Colors:** Hex/RGB values grouped logically (Primary, Secondary, Background, Text-Muted, Error).
    *   **Typography:** Font families, base sizes, heading scales, line heights, and weights.
    *   **Spacing & Sizing:** A standardized scale for padding, margins, and gaps (e.g., `sm: 8px`, `md: 16px`, `lg: 24px`).
    *   **Effects:** Shadows, border radii, and opacities.
2.  **Component Definitions (Composites):**
    *   Rules for base components (Buttons, Inputs, Cards) mapping tokens to states (Default, Active, Disabled).
3.  **Layout Constraints:**
    *   Definitions of standard screen margins, safe area handling rules, and max-widths.

## 4. Practical Workflow for the Current Project

Given the existing HTML/CSS mocks in `design-spec/` and the React Native app in `mobile/`:

1.  **Extract the Theme (The "Token Reference" Method):**
    *   Do not just read the raw CSS (which might have overrides). Look at the rendered HTML/CSS.
    *   Extract the resolved values into a structured `theme.json` or a TypeScript constants file in the `mobile/` project.
2.  **Build the "System Prompt Context":**
    *   Create an architecture definition file (e.g., `layout.md` or `ui-rules.md`).
    *   Include the extracted design tokens.
    *   Add explicit React Native constraints: *“No CSS Grid. Use flexbox. Use SafeAreaView for main screens. Import colors from `theme.ts`.”*
3.  **Two-Step AI Generation:**
    *   **Context Gathering:** Point the AI at the specific HTML mock for a screen. Ask it to identify the layout structure and required tokens based *only* on your defined `theme.ts`.
    *   **Code Generation:** Instruct the AI to generate the React Native code (`View`, `Text`, custom components) applying the identified tokens and adhering strictly to the React Native constraints document. 
4.  **Componentize Early:** Have the AI generate base components (Button, Typography) first using the tokens, then use those components to build the screens, rather than inline styling everything.