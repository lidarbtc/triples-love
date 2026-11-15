<script>
  // Label the seal unless visible text next to it already says the project is verified.
  export let label = '';
</script>

<svg
  class="verified-seal"
  viewBox="0 0 24 24"
  role={label ? 'img' : null}
  aria-label={label || null}
  aria-hidden={label ? null : 'true'}
>
  <path d="M12 2.5A3.64 3.64 0 0 1 17.58 4.31A3.64 3.64 0 0 1 21.04 9.06A3.64 3.64 0 0 1 21.04 14.94A3.64 3.64 0 0 1 17.58 19.69A3.64 3.64 0 0 1 12 21.5A3.64 3.64 0 0 1 6.42 19.69A3.64 3.64 0 0 1 2.96 14.94A3.64 3.64 0 0 1 2.96 9.06A3.64 3.64 0 0 1 6.42 4.31A3.64 3.64 0 0 1 12 2.5Z" />
  <path class="verified-seal-check" d="M8 12.35l2.75 2.75L16.1 9.6" />
</svg>
