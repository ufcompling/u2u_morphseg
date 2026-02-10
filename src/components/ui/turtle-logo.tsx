export function TurtleLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Simplified monochrome turtle - shell and body only */}
      {/* Head/front */}
      <path
        d="M456.348,230.957c-30.736,0-55.652,24.917-55.652,55.652H512C512,255.873,487.083,230.957,456.348,230.957z"
        fill="currentColor"
        opacity="0.6"
      />
      {/* Front leg */}
      <rect x="311.652" y="302.191" width="89.043" height="106.852" fill="currentColor" opacity="0.5" />
      {/* Back leg */}
      <rect x="33.391" y="303.304" width="89.043" height="105.739" fill="currentColor" opacity="0.5" />
      {/* Shell base */}
      <path
        d="M162.504,146.922l54.539,139.687h183.652c0-56.221-25.264-106.552-65.059-140.23C292.73,146.379,216.98,146.922,162.504,146.922z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* Shell highlight */}
      <path
        d="M335.637,146.379c-31.99-27.088-73.381-43.422-118.594-43.422l-67.896,58.435l67.896,67.827C271.519,229.218,317.938,194.715,335.637,146.379z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Shell main */}
      <path
        d="M217.043,286.609v-140.8c-54.476,0-80.139,0.57-118.594,0.57c-39.795,33.678-65.058,84.009-65.058,140.23H217.043z"
        fill="currentColor"
        opacity="0.75"
      />
      {/* Shell top */}
      <path
        d="M217.043,229.218V102.957c-45.213,0-86.604,16.334-118.594,43.422C116.149,194.715,162.568,229.218,217.043,229.218z"
        fill="currentColor"
        opacity="1"
      />
    </svg>
  );
}
