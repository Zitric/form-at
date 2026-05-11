interface JsonLdProps {
  data: unknown;
}

/**
 * Emits a Schema.org structured-data payload as <script type="application/ld+json">.
 * Google's rich results, ChatGPT, Claude, Perplexity and friends read this to
 * understand what entity the page describes.
 *
 * The `<` escape prevents an attacker-controlled string in the data from
 * breaking out via `</script>`. JSON.stringify itself doesn't escape it.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw text
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
