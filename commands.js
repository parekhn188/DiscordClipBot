import 'dotenv/config';
import { InstallGlobalCommands } from './auth.js';

// Simple test command
const LABEL_COMMAND = {
  name: 'label',
  description: 'Basic command',
  type: 1,
};

const ALL_COMMANDS = [LABEL_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
