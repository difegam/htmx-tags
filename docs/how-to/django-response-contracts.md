# Core Django Response Contracts

Pair the template snippets with normal Django 6 views. These examples use no
integration package: HTMX communicates through request and response headers,
and Django renders named template partials.

## Return a full page or one partial

When one URL serves both normal navigation and HTMX requests, vary the response
on `HX-Request`. The decorator adds the header without replacing an existing
`Vary` value such as `Cookie`.

```python
from django.shortcuts import render
from django.views.decorators.vary import vary_on_headers

from .models import Item


@vary_on_headers("HX-Request")
def item_list(request):
    template_name = (
        "items/index.html#results"
        if request.headers.get("HX-Request") == "true"
        else "items/index.html"
    )
    return render(request, template_name, {"items": Item.objects.all()})
```

Define the partial with `inline` so the full page renders it at its definition
site while the view can also address it directly.

```django
{% partialdef results inline %}
  <section id="results">
    {% for item in items %}
      <article>{{ item }}</article>
    {% endfor %}
  </section>
{% endpartialdef %}
```

Separate fragment-only URLs do not need to inspect `HX-Request` or vary their
responses.

## Validate a CSRF-protected form

Use a normal POST form so the browser and HTMX submit the same fields. The CSRF
token is included in the HTMX request automatically because it is a successful
form control.

```django
<form method="post" action="{% url 'item-create' %}"
      hx-post="{% url 'item-create' %}"
      hx-target="this" hx-swap="outerHTML">
  {% csrf_token %}
  {{ form.as_p }}
  <button type="submit">Save</button>
</form>
```

Return the complete bound form with HTTP 200 when validation fails. HTMX 2 and
HTMX 4 differ in their default handling of error-status responses, so a 422
response is not portable without additional configuration.

```python
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .forms import ItemForm


@require_POST
def item_create(request):
    form = ItemForm(request.POST, request.FILES or None)
    if form.is_valid():
        item = form.save()
        return render(request, "items/index.html#item", {"item": item})
    return render(request, "items/index.html#item-form", {"form": form})
```

File-upload forms also need native `enctype="multipart/form-data"` and HTMX
`hx-encoding="multipart/form-data"`; uploaded files are available in
`request.FILES`.

## Control a response with headers

Core Django responses can set the HTMX headers directly. Send them on the final
non-3xx response because HTMX does not process response headers from an
intermediate redirect.

```python
response = render(request, "items/index.html#item-form", {"form": form})
response.headers["HX-Retarget"] = "#item-form"
response.headers["HX-Reswap"] = "outerHTML"
response.headers["HX-Trigger"] = "items-changed"
return response
```

Use `HX-Redirect` when HTMX should perform full browser navigation:

```python
from django.http import HttpResponse
from django.urls import reverse

response = HttpResponse()
response.headers["HX-Redirect"] = reverse("item-list")
return response
```

`HX-Retarget`, `HX-Reswap`, `HX-Redirect`, and `HX-Trigger` are shared by the
supported HTMX versions. The older `HX-Trigger-After-Swap` and
`HX-Trigger-After-Settle` variants are intentionally excluded.

## Return out-of-band updates

An HTMX response may contain primary content and independent out-of-band
fragments. Give every OOB fragment its own target and do not make either update
depend on processing order, which differs between HTMX 2 and HTMX 4.

```django
<article id="item-{{ item.pk }}">{{ item }}</article>

<section id="summary" hx-swap-oob="true">
  {{ item_count }} items
</section>
```

## Acknowledgments

The independently authored examples were informed by these public Django and
HTMX projects:

- [andyjud/django-starter](https://github.com/andyjud/django-starter)
- [jacklinke/django-htmx-todo-list](https://github.com/jacklinke/django-htmx-todo-list)
- [bugbytes-io/Django-HTMX-Finance-App](https://github.com/bugbytes-io/Django-HTMX-Finance-App)
- [dennisivy/HTMX-Django-Blog](https://github.com/dennisivy/HTMX-Django-Blog)
- [cltrudeau/jb_htmx_demo](https://github.com/cltrudeau/jb_htmx_demo)
- [bugbytes-io/htmx-contacthub](https://github.com/bugbytes-io/htmx-contacthub/tree/video-10)

## References

- [HTMX 4 migration guide](https://four.htmx.org/migration-guide-htmx-4/)
- [Django 6 template partials](https://docs.djangoproject.com/en/6.0/ref/templates/language/#template-partials)
- [Django CSRF protection](https://docs.djangoproject.com/en/6.0/howto/csrf/)
- [Django `Vary` response utilities](https://docs.djangoproject.com/en/6.0/topics/cache/#using-vary-headers)
