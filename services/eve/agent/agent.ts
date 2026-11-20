import { jarvisDefinition } from '../src/agent.js';
import { realModel } from '../src/gateway.js';
export default jarvisDefinition(() => realModel());
