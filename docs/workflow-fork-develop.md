# Workflow de Fork: entrega ao upstream + integração local (develop)

Este documento descreve o fluxo de trabalho deste repositório quando ele é usado
como **fork** de um upstream (`obogoni/playground`) com uma linha de integração
local própria (`develop`). O objetivo é permitir desenvolver e **usar
localmente** todas as features antes de o dono do upstream aprovar os PRs, sem
sujar o `main` do fork nem poluir os PRs enviados para cima.

## Estrutura de branches

| Branch | Papel | Recebe o quê |
| ------ | ----- | ------------ |
| `main` | **Espelho do upstream** — nunca recebe merge de feature direto | `origin/main` (via `git merge origin/main`) |
| `develop` | **Linha de integração local** — todas as features funcionais juntas | merge local das feature branches |
| `feature/<nome>` | Trabalho de uma demanda | nasce de `main` (ou da branch de uma dependência) |

## Princípios

- Branch de feature **sempre** nasce de `main` — ou da branch da feature da qual
  depende — **nunca** de `develop`.
- **PR é só para o upstream.** A `develop` recebe via merge local, não via PR.
- `main` nunca diverge do upstream; se divergiu, está quebrado.
- A `develop` pode divergir à vontade — ela é descartável/recriável.

## Fluxo por feature (independente)

```text
main (espelho upstream) → feature/xxx → PR pro upstream   ← entrega
                                           ↘ merge local na develop ← uso local
```

1. Atualizar `main`:
   ```powershell
   git checkout main
   git fetch origin && git merge origin/main
   ```
2. Criar a branch de feature:
   ```powershell
   git checkout -b feature/xxx
   ```
3. Desenvolver, commitar, testar (gate: `npm run typecheck && npm run lint && npm test`).
4. Entregar ao upstream:
   ```powershell
   git push fork feature/xxx
   # abrir PR de viniciussaide:feature/xxx → obogoni:main
   ```
5. Usar localmente sem esperar a aprovação:
   ```powershell
   git checkout develop
   git merge feature/xxx
   ```
6. Quando o upstream aprovar e mergear o PR, absorver em `main` e depois na
   `develop` (o merge é limpo — a develop já tem o mesmo conteúdo):
   ```powershell
   git fetch origin
   git checkout main && git merge origin/main
   git checkout develop && git merge main
   ```

### Por que o passo 6 não conflita

A `develop` já contém a feature (foi mergeada no passo 5). Quando `main`
recebe a mesma feature via upstream, o git compara **árvores**, não SHAs — os
dois lados têm o mesmo conteúdo, então o merge é um no-op de conteúdo. Mesmo que
o upstream use **squash merge** (commit com SHA diferente), o conteúdo é o mesmo
e o merge continua limpo. O `git merge main` na develop existe apenas para ela
acompanhar as demais mudanças que o upstream aceitou no meio tempo.

**Exceção:** conflito real só acontece se outro PR do upstream mexeu em áreas que
suas features locais ainda não mergeadas também mexeram — aí é um conflito de
merge normal, resolvido na `develop`.

## Fluxo com dependência entre PRs (stacked PRs)

Quando a feature B depende da feature A, e o PR de A **ainda não foi aprovado**
no upstream:

```text
main → feature/A (PR #X, pendente)
         └→ feature/B (PR #Y, depende do #X)
```

1. Criar a branch de B a partir da branch de A (a dependência), **não** do develop:
   ```powershell
   git checkout feature/A
   git checkout -b feature/B
   ```
2. Desenvolver B, commitar, testar.
3. Publicar B e abrir o PR **para o `main` do upstream**, com a descrição
   *"depends on #X"*.

**O que o reviewer vê no início:** o diff de `A` + `B` (o `main` ainda não tem
o `A`). Isso é esperado e aceito em stacked PRs.

4. Quando o `#X` for mergeado no upstream, "destacar" o B:
   ```powershell
   git fetch origin
   git checkout feature/B
   git rebase origin/main
   git push --force-with-lease fork feature/B
   ```
   O commit do `A` sai do diff do PR #Y — o PR passa a mostrar só o `B`.

5. Uso local: enquanto o `#X` não sobe, a `develop` já tem o `A`, então:
   ```powershell
   git checkout develop
   git merge feature/B
   ```
   A `develop` é onde tudo se junta; a pilha de branches serve só para o PR
   ficar apresentável.

> Se dois PRs seus são dependentes e ambos ainda pendentes, o rebase quando o
> pai subir pode ser feito com `--onto`:
> ```powershell
> git rebase --onto origin/main feature/A feature/B
> ```

## Regras práticas (resumo)

- Branch de feature nasce de `main` ou da branch da dependência — **nunca** de
  `develop`.
- PR é só para o upstream; a `develop` recebe via merge local.
- Dependência entre PRs = branch encadeada + `depends on #N` + rebase quando o
  pai sobe.
- `main` espelha upstream; `develop` integra tudo localmente.