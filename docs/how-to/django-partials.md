# Django Partials

Define, render, complete, and navigate Django 6 partials in templates and Python views.

## Define a partial

```django
{% partialdef result_card %}
  <article>{{ result.title }}</article>
{% endpartialdef %}
```

Use `inline` when the definition should also render at its definition site:

```django
{% partialdef result_card inline %}
  <article>{{ result.title }}</article>
{% endpartialdef %}
```

The `partialdef` and `partialdef-inline` snippets insert these structures.

## Render a local partial

```django
{% partial result_card %}
```

After `{% partial`, completion offers names defined in the current file. Hovering a definition or reference identifies its definition line and whether it is inline. Go to Definition and Peek Definition jump from the reference to the matching `partialdef` block.

Typing after `{%` also offers `partialdef`, `partialdef … inline`, `partial`, and `endpartialdef` tag completions.

## Rename and find references

With the cursor on a partial name, Find All References (`Shift+F12`) lists the `partialdef` definition and every `{% partial %}` use in the file, and Rename Symbol (`F2`) rewrites the definition and all of its references together. Both work from either a definition or a reference and stay within the current template.

## Reference a partial in another template

Completion after `#` reads definitions from matching workspace templates:

```django
{% include "results/cards.html#result_card" %}
```

The same completion and navigation work for static template arguments to `render`, `render_to_string`, `get_template`, `select_template`, and `TemplateResponse`, including qualified calls and documented keyword arguments:

```python
return render(request, "results/cards.html#result_card", context)
```

## Diagnostics

The extension warns about duplicate `{% partialdef name %}` definitions and references that cannot be resolved in the same file. It ignores partial-looking text in HTML comments, Django comments, `{% verbatim %}` blocks, and `<script>`/`<style>` bodies. The quick fix for an unresolved reference offers the nearest defined partial name or a `{% partialdef %}` stub appended to the file.

!!! note "Deliberate limit"

    No workspace-wide index or Django settings model is built. Files are matched by exact template-path suffix on demand, so duplicate paths produce multiple navigation targets. Dynamic template variables, concatenated strings, bytes, and Python f-strings are outside the extension's analysis scope.

![Django partial completion](../assets/images/partials.png)
