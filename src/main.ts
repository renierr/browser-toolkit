import type { CustomMainContext } from './js/types';

export default function main(ctx: CustomMainContext) {
  console.log('Loaded tools:', ctx.tools.length);

  // TODO some init logic
}
