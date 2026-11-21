<script>
  import VerifiedSeal from './VerifiedSeal.svelte';
  import { projectCopy, splitLastWord } from '#lib/project-copy.js';

  export let name;
  export let lang = 'en';
  $: t = projectCopy[lang] || projectCopy.en;
  $: [nameStart, nameEnd] = splitLastWord(name);
</script>

<figure class="verification-preview">
  <figcaption>{t.badgePreview}</figcaption>
  <div class="verification-example">
    {nameStart}<span class="verification-name-end">{nameEnd}<VerifiedSeal /></span>
  </div>
</figure>

<style>
  .verification-preview { margin: 0; min-width: 0; }
  figcaption { color: var(--ink-2); font-size: 12px; line-height: 1.5; }
  .verification-example { margin-top: 7px; font-size: 22px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
  .verification-name-end { display: inline-block; max-width: 100%; }
  .verification-name-end :global(.verified-seal) { width: .75em; height: .75em; margin-left: .25em; vertical-align: -.02em; }
</style>
