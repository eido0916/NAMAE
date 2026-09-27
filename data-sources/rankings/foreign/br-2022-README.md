---
license: cc-by-4.0
language:
- pt
pretty_name: IBGE Nomes no Brasil 2022
size_categories:
- 1M<n<10M
task_categories:
- tabular-classification
- text-classification
tags:
- names
- onomastics
- brazil
- ibge
- census
- censo-2022
- demographics
- portuguese
- gender
configs:
- config_name: name_ranking
  data_files: parquet/name_ranking.parquet
- config_name: name_detail
  data_files: parquet/name_detail.parquet
- config_name: name_by_decade
  data_files: parquet/name_by_decade.parquet
- config_name: name_variant
  data_files: parquet/name_variant.parquet
- config_name: name_by_state
  data_files: parquet/name_by_state.parquet
- config_name: name_by_municipality
  data_files: parquet/name_by_municipality.parquet
- config_name: name_description
  data_files: parquet/name_description.parquet
- config_name: name_description_source
  data_files: parquet/name_description_source.parquet
- config_name: region
  data_files: parquet/region.parquet
- config_name: state
  data_files: parquet/state.parquet
- config_name: municipality
  data_files: parquet/municipality.parquet
---

# IBGE Nomes no Brasil 2022

Este dataset reúne os **nomes próprios e sobrenomes no Brasil** disponibilizados pelo **Censo Demográfico 2022** do IBGE, organizados em um modelo relacional e distribuídos em arquivos Parquet.

A base contém cerca de **128 mil nomes** e **202 mil sobrenomes**, com dados de frequência, ranking, distribuição por sexo, idade mediana, evolução por década, variantes de grafia e distribuição geográfica até o nível de município (5.570).

Também inclui os verbetes editoriais de significado e origem disponibilizados pelo IBGE para os 90 nomes e sobrenomes mais comuns.

Os dados foram extraídos da API pública usada pelo próprio site [Nomes no Brasil](https://censo2022.ibge.gov.br/nomes/).

---

## Detalhes

* **Idioma:** Português (Brasil)
* **Domínio:** onomástica, demografia e dados censitários
* **Formato:** Parquet, com uma tabela por arquivo
* **Estrutura:** modelo relacional normalizado
* **Volume:** aproximadamente 6,2 milhões de linhas somando todas as tabelas de fatos
* **Cobertura temporal:** nascimentos até 2022, agrupados em faixas por década, de "até 1930" a "2020–2022"
* **Granularidade geográfica:** Brasil, Unidade da Federação (27) e Município (5.570)
* **Licença:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

### Licença e atribuição

Esta compilação está disponível sob **CC BY 4.0**. Você pode usar, redistribuir e adaptar os dados, inclusive comercialmente, desde que dê os devidos créditos.

* **Compilação e estruturação:** Gabriel Lobo ([@olob0](https://huggingface.co/olob0))
* **Dados originais:** IBGE - Censo Demográfico 2022

Os dados originais são de domínio público e foram produzidos e disponibilizados pelo IBGE. A atribuição CC BY se refere ao trabalho de coleta, organização, modelagem e empacotamento deste dataset. Os dados originais continuam pertencendo ao IBGE.

---

## Casos de uso

Alguns usos possíveis para este dataset:

* **Estimativa de gênero** a partir do nome, usando `male_count` e `female_count`.
* **Estimativa de idade** a partir de `median_age` ou da distribuição por década.
* **Análise onomástica e sociolinguística**, como tendências de nomes ao longo do tempo, regionalismos e variantes de grafia.
* **Geodemografia**, analisando a concentração de nomes e sobrenomes por UF e município.
* **Deduplicação e normalização de cadastros**, usando nomes e sobrenomes reais e suas frequências no Brasil.
* **Geração de dados sintéticos**, fazendo amostragem de nomes de acordo com sua frequência real.
* **Visualizações**, como rankings, mapas coropléticos e séries temporais de popularidade.

---

## Estrutura

A estrutura é baseada em uma tabela principal (`name_ranking`) e várias tabelas relacionadas com informações adicionais, além das dimensões geográficas e dos dados editoriais.

A chave de negócio usada para identificar um nome é o par **`(name_text, name_type)`**, onde `name_type` pode ser `given` (nome próprio) ou `surname` (sobrenome).

### Tabelas de fatos

| Tabela                 | Grão                                        |    Linhas | Descrição                                                                                      |
| ---------------------- | ------------------------------------------- | --------: | ---------------------------------------------------------------------------------------------- |
| `name_ranking`         | `(name_text, name_type)`                    |   330.059 | Tabela principal. Contém frequência, percentual e ranking nacional de cada nome e sobrenome.   |
| `name_detail`          | `(name_text, name_type)`                    |   330.058 | Ranking dentro da letra inicial, contagem por sexo e idade mediana.                            |
| `name_by_decade`       | `(name_text, name_type, decade)`            |   221.524 | Frequência por faixa de década de nascimento. Contém apenas nomes próprios.                    |
| `name_variant`         | `(name_text, name_type, variant_text)`      |   623.966 | Variantes de grafia e suas respectivas frequências.                                            |
| `name_by_state`        | `(name_text, name_type, state_code)`        |   828.567 | Distribuição por UF, com frequência e percentual.                                              |
| `name_by_municipality` | `(name_text, name_type, municipality_code)` | 4.088.822 | Distribuição por município, com frequência e percentual. Contém apenas células não suprimidas. |

### Dimensões

| Tabela                    | Chave                         | Linhas | Descrição                                                   |
| ------------------------- | ----------------------------- | -----: | ----------------------------------------------------------- |
| `region`                  | `code`                        |      5 | Grandes regiões do Brasil.                                  |
| `state`                   | `code`                        |     27 | Unidades da Federação, com população total.                 |
| `municipality`            | `code`                        |  5.571 | Municípios, com hierarquia geográfica e população.          |
| `name_description`        | `(name_text, name_type)`      |     90 | Significado e origem dos 90 nomes e sobrenomes mais comuns. |
| `name_description_source` | `(name_text, name_type, url)` |    334 | Fontes bibliográficas usadas nos verbetes.                  |

### Principais campos

* **`name_text`** - nome ou sobrenome em minúsculas e sem diacríticos. Por exemplo, `antonio` e `goncalves`.
* **`name_type`** - `given` para nome próprio ou `surname` para sobrenome.
* **`frequency`** - número de pessoas.
* **`percentage`** - percentual cru retornado pela fonte. Por exemplo, `0.5964` significa 0,5964% da população. Não é uma proporção entre 0 e 1.
* **`rank`** - posição no ranking nacional dentro do tipo.
* **`letter_rank`** - posição dentro da letra inicial.
* **`male_count` / `female_count`** - quantidade de pessoas por sexo. `NULL` significa que o dado está ausente ou foi suprimido. Não significa zero. Nomes unissex podem ter os dois campos preenchidos.
* **`median_age`** - idade mediana das pessoas com aquele nome.
* **`decade`** - `SMALLINT`. O valor `1930` significa "até 1930", enquanto `2020` representa "2020–2022".
* **`variant_text`** - variante de grafia, como `gabryel` para `gabriel`.
* **`state_code` / `municipality_code`** - códigos oficiais do IBGE, com 2 e 7 dígitos.
* **`meaning` / `origin`** - textos editoriais em HTML, incluindo links internos e marcação.

### Relação entre as tabelas

<img src="https://huggingface.co/datasets/olob0/ibge-nomes-no-brasil-2022/resolve/main/media/schema.png" alt="schema" width="600">

Todas as tabelas de fatos `name_*` usam `(name_text, name_type)` para se relacionar com `name_ranking`.

As tabelas geográficas usam `state_code` e `municipality_code`, seguindo a hierarquia `municipality -> state -> region`.

> `name_ranking` já contém a lista completa e ordenada. Os "vizinhos de ranking" (nomes em posições ±N) Não foram armazenados, porque eles podem ser reconstruídos facilmente usando `ORDER BY rank`.

---

## Fonte, coleta e processamento

### Fonte

Os dados originais são do **IBGE — Instituto Brasileiro de Geografia e Estatística**, com base no **Censo Demográfico 2022**.

A ferramenta oficial e os dados originais estão disponíveis em:

https://censo2022.ibge.gov.br/nomes/

A metodologia utilizada pelo IBGE está descrita na Nota Técnica sobre Nomes no Brasil.

### Coleta

Dados extraídos da API pública que alimenta o site oficial:

`https://servicodados.ibge.gov.br/api/v3/nomes/2022`

Para as dimensões geográficas, foi usada também a API de localidades (`/api/v1/localidades`).

Os verbetes de significado e origem foram extraídos do bundle do próprio site.

Não foram adicionados dados inferidos ou enriquecidos de fontes externas. O objetivo foi manter o dataset o mais próximo possível do que o próprio IBGE disponibiliza.

### Processamento

Durante a organização dos dados:

* `nome` e `sobrenome` foram mapeados para `given` e `surname`.
* As células suprimidas pelo sigilo estatístico foram removidas de `name_by_municipality`.
* O endpoint específico de estados não foi usado, pois os dados de UF já estavam disponíveis nos detalhes de cada nome e seriam redundantes.

---

## Observações e limitações

### 1. Sigilo estatístico

O IBGE suprime frequências baixas: mínimo de **20** no Brasil, **15** por UF e **10** por município, inclusive nas distribuições por década.

Por isso, os números não necessariamente fecham quando somados entre as tabelas:

* a soma das UFs não é igual ao total nacional
* a soma dos municípios não é igual ao total da UF
* alguns nomes possuem poucas ou nenhuma linha em `name_by_state` e `name_by_municipality`

Muitos nomes têm pouca ou nenhuma linha geográfica: ~34% não aparecem em nenhuma UF e ~53% não têm nenhum município não-suprimido. Entre os que aparecem em ao menos uma UF, a média é ~3,8 UFs (≈2,5 se considerados todos os nomes).

Isso é esperado e vem diretamente da forma como os dados são publicados pelo IBGE.

### 2. O sobrenome `perl` está incompleto

O sobrenome `perl` está presente em `name_ranking`, com frequência e ranking corretos, mas não possui dados em `name_detail`, `name_by_decade`, `name_variant`, `name_by_state` ou `name_by_municipality`.

A API do IBGE bloqueia requisições para esse nome. Acredito que isso aconteça por um falso-positivo de WAF causado pela string `perl` na URL.

O impacto estatístico é desprezível, mas estou documentando o caso para deixar claro o motivo da ausência desses dados.

### 3. População municipal parcialmente ausente

O campo `municipality.population` foi preenchido de forma oportunística a partir dos dados expostos pela própria fonte.

A API só disponibiliza a população para os municípios que aparecem entre os de maior proporção para algum nome. Por isso, a cobertura não é completa:

* **5.564 de 5.571 municípios** possuem população;
* **7 municípios** ficaram com `NULL`.

Seis desses municípios são cidades pequenas que nunca aparecem no topo de nenhum nome. O outro caso é descrito abaixo.

### 4. Município "fantasma"

`Boa Esperança do Norte` (código `5101837`, MT) aparece na dimensão `municipality`, obtida pela API de localidades, mas não é referenciado por nenhum fato do dataset.

Esse município foi [instalado oficialmente por volta de 2025](https://cidades.ibge.gov.br/brasil/mt/boa-esperanca-do-norte/panorama) e ainda não aparece na base de nomes do Censo 2022, que trabalha com 5.570 municípios.

Por isso, ele aparece sem população e com `state_code` derivado do prefixo do código (`51` = MT).

### 5. Descrições editoriais

As tabelas `name_description` e `name_description_source` não cobrem todos os nomes.

Elas existem apenas para:

* os 30 nomes femininos mais comuns
* os 30 nomes masculinos mais comuns
* os 30 sobrenomes mais comuns

Os textos são editoriais, estão armazenados em HTML e incluem as fontes utilizadas nos próprios verbetes.

### 6. Normalização

Os nomes seguem o padrão da fonte e são armazenados em minúsculas e sem acentos.

Variantes de grafia são tratadas como entradas diferentes. Por exemplo:

`ana` ≠ `anna`
`luis` ≠ `luiz`

---

## Citação

Se você usar este dataset, cite tanto esta compilação quanto a fonte original dos dados.

**Compilação:**

```bibtex
@misc{lobo_ibge_nomes_no_brasil_2022,
  author       = {Gabriel Lobo (@olob0)},
  title        = {IBGE Nomes no Brasil 2022},
  year         = {2026},
  publisher    = {Hugging Face},
  howpublished = {\url{https://huggingface.co/datasets/olob0/ibge-nomes-no-brasil-2022}}
}
```

**Fonte original:**

```bibtex
@misc{ibge_nomes_no_brasil_2022,
  author       = {{Instituto Brasileiro de Geografia e Estatística (IBGE)}},
  title        = {Nomes no Brasil --- Censo Demográfico 2022},
  year         = {2022},
  howpublished = {\url{https://censo2022.ibge.gov.br/nomes/}}
}
```

---

*Dados originais de domínio público, produzidos e disponibilizados pelo IBGE (Censo Demográfico 2022). Compilação e estruturação por Gabriel Lobo (@olob0), sob CC BY 4.0.*
