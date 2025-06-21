---
description: Update the current file to use delta builder
---

Replace each delta instantiation with a fluent call to createDelta from delta builder
    - pass creator and host as arguments to createDelta
    - use setProperty where appropriate