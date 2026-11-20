import { jarvisChannel } from '../../src/channel.js';
import { adminAuth } from '../../src/auth.js';
export default jarvisChannel(adminAuth());
