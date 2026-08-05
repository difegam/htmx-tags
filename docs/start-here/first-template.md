# First Template

Build a small Django template that replaces a result area with an HTMX response and defines a local partial.

## Prerequisites

- The file language mode is **Django HTML**.
- The Django URL named `catalog:results` exists in your project.

## Template

```django
<button
  hx-get="{% url 'catalog:results' %}"
  hx-target="#results"
  hx-swap="innerHTML">
  Load results
</button>

<section id="results">
  {% partialdef result_card inline %}
    <article id="result-{{ result.pk }}">{{ result.title }}</article>
  {% endpartialdef %}
</section>

{% partial result_card %}
```

The extension completes `hx-*` attributes and documented values such as `innerHTML`. In a `{% partial ` tag, it offers definitions from the same template and reports unknown or duplicate local partial names.

## Verify

1. Place the cursor after `hx-` and request completion.
1. Place it inside `hx-swap=""` and request completion.
1. Hover `result_card` in `{% partial result_card %}`.
1. Change the reference to a missing name and confirm a diagnostic appears.

!!! note "Same-file scope"

    Cross-template references such as `template.html#result_card` are resolved from matching workspace files on demand; Django loader order is not modeled.
