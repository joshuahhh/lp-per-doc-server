---
title: A test
author:
  - name: Joshua Horowitz
    org: University of Washington
    email: joho@uw.edu
output:
    latex: true
---

~~~ latex:preamble
\newcommand*{\grabto}[2]{\IfFileExists{#2}{}{\immediate\write18{curl \detokenize{#1 -o #2}}}}

\grabto{https://upload.wikimedia.org/wikipedia/commons/7/76/Bhutanese_thanka_of_Mt._Meru_and_the_Buddhist_Universe.jpg}{meru.jpg}
~~~



If $x < 10$, we're in luck yay.

![Mt Meru](meru.jpg)
