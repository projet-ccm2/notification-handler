process.env.NODE_ENV = "test";

const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

process.env.PORT = "3000";
process.env.NODE_ENV = "test";
