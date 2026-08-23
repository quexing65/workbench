import { useAutoAnimate } from '@formkit/auto-animate/react';

// auto-animate 默认尊重系统“减少动态效果”偏好，此处仅集中管理动画时长。
export function useAnimatedList<T extends HTMLElement>() {
  const [parent] = useAutoAnimate<T>({ duration: 220 });
  return parent;
}
