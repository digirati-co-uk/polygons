import { useEffect, useMemo, useState } from 'react';
import { createHelper, SlowState } from 'polygons-core';

export function useHelper(
  data: any,
  render: (t: any, s: any) => void,
  commitShape: (shape: { points: Array<[number, number]>; open: boolean }) => void
) {
  const [state, setState] = useState<SlowState>({} as any);
  const helper = useMemo(() => {
    return createHelper(data, commitShape);
  }, []);

  useEffect(() => {
    helper.clock.start(render, setState);
    return () => {
      helper.clock.stop();
    };
  }, []);

  return {
    state,
    helper,
  };
}
