// The face shapes Colvy AI's mascot (components/AiBuddy) can take, in the
// order the face picker shows them. A plain module so server code can check a
// saved shape too.

export type BuddyShape = 'squircle' | 'pillow' | 'flower' | 'star' | 'blob' | 'pill' | 'ghost' | 'gem' | 'cookie' | 'circle' | 'bubble' | 'splat'
export const BUDDY_SHAPES: BuddyShape[] = ['squircle', 'pillow', 'flower', 'star', 'blob', 'pill', 'ghost', 'gem', 'cookie', 'circle', 'bubble', 'splat']
export const BUDDY_SHAPE_LABEL: Record<BuddyShape, string> = {
  squircle: 'Rounded square', pillow: 'Cushion', flower: 'Flower', star: 'Star', blob: 'Pebble', pill: 'Capsule',
  ghost: 'Ghost', gem: 'Gem', cookie: 'Cookie', circle: 'Circle', bubble: 'Speech bubble', splat: 'Splat',
}
