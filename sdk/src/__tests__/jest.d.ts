import { JestMockExtended } from 'jest-mock-extended';

declare global {
  namespace jest {
    interface Mock<T = any> extends JestMockExtended<T> {}
    interface SpyInstance<T = any> extends JestMockExtended<T> {}
  }
}
