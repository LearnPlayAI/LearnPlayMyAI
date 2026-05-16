declare module '*.jsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<any>;
  export default component;
}

declare module '@/pages/*.jsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<any>;
  export default component;
}

declare module '@/components/*.jsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<any>;
  export default component;
}
