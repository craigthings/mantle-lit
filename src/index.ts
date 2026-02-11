export {
  // Core classes
  View,
  ViewModel,
  Behavior,
  
  // Wrappers
  createView,
  createBehavior,
  
  // Helpers
  mount,
  
  // Decorators (for explicit annotation mode)
  observable,
  action,
  computed,
  
  // Lit's property decorator (re-exported for convenience)
  property,
  
  // Config
  configure,
  
  // Types
  type Props,
  type PropType,
  type CreateViewOptions,
} from './mantle';

export type { MantleConfig, MantleErrorContext, WatchOptions } from './mantle';
