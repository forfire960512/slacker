import { render, Text } from "ink";

/**
 * Terminal entry point — scaffolding only. TODO: wire up
 * @slacker/core's useChatStore the same way apps/web does (core's
 * state/networking hooks are meant to be reused as-is here per
 * docs/ARCHITECTURE.md), and build the actual message-list/input Ink
 * components. Links render via OSC 8 escapes once that lands.
 */
function App() {
  return <Text>slacker cli — not implemented yet.</Text>;
}

render(<App />);
