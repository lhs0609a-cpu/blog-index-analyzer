'use client'

import { CSSProperties } from 'react'

const FLUENT_CDN = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets'

const PATHS: Record<string, string> = {
  sparkles: 'Sparkles/3D/sparkles_3d.png',
  envelope: 'Envelope/3D/envelope_3d.png',
  locked: 'Locked/3D/locked_3d.png',
  unlocked: 'Unlocked/3D/unlocked_3d.png',
  eye: 'Eye/3D/eye_3d.png',
  house: 'House/3D/house_3d.png',
  rocket: 'Rocket/3D/rocket_3d.png',
  chart: 'Bar chart/3D/bar_chart_3d.png',
  check: 'Check mark button/3D/check_mark_button_3d.png',
  cross: 'Cross mark/3D/cross_mark_3d.png',
  gear: 'Gear/3D/gear_3d.png',
  magnifier: 'Magnifying glass tilted left/3D/magnifying_glass_tilted_left_3d.png',
  warning: 'Warning/3D/warning_3d.png',
  bulb: 'Light bulb/3D/light_bulb_3d.png',
  fire: 'Fire/3D/fire_3d.png',
  trash: 'Wastebasket/3D/wastebasket_3d.png',
  star: 'Star/3D/star_3d.png',
  pencil: 'Pencil/3D/pencil_3d.png',
  chart_up: 'Chart increasing/3D/chart_increasing_3d.png',
  chart_down: 'Chart decreasing/3D/chart_decreasing_3d.png',
  user: 'Bust in silhouette/3D/bust_in_silhouette_3d.png',
  bell: 'Bell/3D/bell_3d.png',
  link: 'Link/3D/link_3d.png',
  page: 'Page facing up/3D/page_facing_up_3d.png',
  folder: 'File folder/3D/file_folder_3d.png',
  money: 'Money bag/3D/money_bag_3d.png',
  target: 'Bullseye/3D/bullseye_3d.png',
  brain: 'Brain/3D/brain_3d.png',
  hourglass: 'Hourglass not done/3D/hourglass_not_done_3d.png',
}

export type Emoji3DName = keyof typeof PATHS

interface Props {
  name: Emoji3DName
  size?: number
  className?: string
  alt?: string
  style?: CSSProperties
}

export default function Emoji3D({ name, size = 24, className, alt, style }: Props) {
  const path = PATHS[name]
  if (!path) return null
  const src = `${FLUENT_CDN}/${encodeURI(path)}`
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt ?? name}
      width={size}
      height={size}
      className={className}
      style={style}
      draggable={false}
      loading="lazy"
    />
  )
}
