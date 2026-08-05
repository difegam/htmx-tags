# Author HTMX

Use attribute, value, alias, and dynamic-name completion in supported HTML and Django template files.

## Add an attribute

Within an opening element, type `hx-` and select an item. A normal selection inserts an empty quoted value with the cursor inside it.

```html
<button hx-get="">
</button>
```

If an `=` or quoted value already exists, completion replaces only the attribute name and does not duplicate punctuation.

## Complete a documented value

Request completion inside the value of an attribute with catalog-backed values:

```html
<div hx-swap="">
</div>
<input hx-trigger="keyup changed delay:"/>
<section hx-target="closest ">
</section>
```

`hx-swap` provides swap strategies; `hx-trigger` provides event and modifier fragments; `hx-target` provides target forms. Hover an attribute for its version availability, suggested values, and official HTMX links.

## Use `data-hx-*`

Start with `data-hx` when your HTML policy requires data attributes:

```html
<button data-hx-get="/results" data-hx-target="#results">
 Load
</button>
```

The catalog stores only `hx-*`; aliases have identical completion, hover, and diagnostic behavior.

## Use dynamic syntax

```html
<form hx-on::after-request="this.reset()" hx-status:422="target:#errors" hx-target-4*="#errors">
</form>
```

`hx-target-*` response-target syntax is catalogued as HTMX 2 extension syntax. `hx-status:*` is HTMX 4 syntax. Select a version mode if you want those differences surfaced as editor hints.

![Hover documentation](../assets/images/hover.png)
