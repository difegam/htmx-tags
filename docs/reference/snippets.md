# Snippets

The extension contributes these snippets for `django-html` documents.

| Prefix              | Inserts                                                  |
| ------------------- | -------------------------------------------------------- |
| `htmx-get`          | Django URL-backed HTMX GET button.                       |
| `htmx-post`         | CSRF-safe Django form using `hx-post`.                   |
| `htmx-delete`       | Delete button with confirmation, target, and outer swap. |
| `htmx-search`       | Debounced search input.                                  |
| `htmx-infinite`     | `revealed` trigger for next-page loading.                |
| `partialdef`        | Standard Django partial definition.                      |
| `partialdef-inline` | Inline Django partial definition.                        |
| `partial`           | Same-file Django partial render tag.                     |

## Example

Typing `htmx-post` creates a form that includes Django's CSRF token:

```django
<form hx-post="{% url 'view-name' %}" hx-target="#content" hx-swap="innerHTML">
  {% csrf_token %}
</form>
```

Snippet placeholders are editable: replace `view-name`, targets, content, and partial names with values from the template.
