import type { OstromPrinciple } from '../types.js';

export const OSTROM_PRINCIPLES: OstromPrinciple[] = [
  {
    "number": 1,
    "name": "Clearly Defined Boundaries",
    "description": "A commons MUST have clearly defined boundaries so that commoners know who has permission to use the resource. Outsiders who do not contribute to the commons generally have no rights to access or use the common-pool resource, at least for depletable natural wealth.",
    "diagnostic_questions": [
      "Can every member of the commons identify exactly who is and is not entitled to use the resource?",
      "Are outsiders who have not contributed to the commons explicitly excluded from access?",
      "Is the physical or conceptual boundary of the resource itself clearly demarcated (e.g., a specific pasture, fishery, aquifer, or codebase)?",
      "Is there a recognized process for admitting new members or revoking access?"
    ],
    "example_commons_ids": [
      "erakulapally-seed-sharing",
      "wolfpak-surfers",
      "torbel-alpine-commons",
      "huerta-irrigation-spain"
    ]
  },
  {
    "number": 2,
    "name": "Congruence Between Rules and Local Conditions",
    "description": "Rules for appropriating a resource MUST take account of local conditions and MUST include limits on what can be taken and how. One-size-fits-all rules imported from outside are likely to fail; effective rules are tailored to the specific ecological, social, and historical circumstances of the commons.",
    "diagnostic_questions": [
      "Do the rules governing resource use reflect the specific ecological rhythms and limits of this particular resource (e.g., seasonal harvesting windows, sustainable yield thresholds)?",
      "Were the rules developed by people with intimate, long-term knowledge of the local resource rather than imported wholesale from outside?",
      "Do the rules distinguish between household use and commercial sale where relevant?",
      "Have the rules been revised in response to observed changes in the resource or community?"
    ],
    "example_commons_ids": [
      "torbel-alpine-commons",
      "huerta-irrigation-spain",
      "erakulapally-seed-sharing",
      "los-angeles-groundwater-commons"
    ]
  },
  {
    "number": 3,
    "name": "Collective Choice Arrangements",
    "description": "Commoners MUST be able to create or influence the rules that govern their commons. If external governmental officials presume that only they have the authority to set the rules, it will be very difficult for local appropriators to sustain a rule-governed common-pool resource over the long run.",
    "diagnostic_questions": [
      "Do the people who use and depend on the resource have a meaningful say in making and revising the rules?",
      "Is rule-making controlled primarily by the commoners themselves rather than by external governmental authorities?",
      "Is there a recognized forum or process through which commoners can propose and debate rule changes?",
      "Are marginalized or less powerful members of the community included in collective decision-making?"
    ],
    "example_commons_ids": [
      "wolfpak-surfers",
      "erakulapally-seed-sharing",
      "torbel-alpine-commons",
      "linux-kernel-development"
    ]
  },
  {
    "number": 4,
    "name": "Monitoring",
    "description": "Commoners MUST be willing to monitor how their resources are used or abused. Effective monitoring SHOULD be carried out by community members or actors accountable to the community, not solely by distant external authorities who lack contextual knowledge.",
    "diagnostic_questions": [
      "Is there an active system for observing and recording how the resource is being used?",
      "Are the monitors members of the community or otherwise accountable to it, rather than purely external agents?",
      "Is monitoring frequent and contextually informed enough to detect overuse or rule violations in a timely way?",
      "Are monitoring costs shared equitably among commoners rather than borne by one party alone?"
    ],
    "example_commons_ids": [
      "torbel-alpine-commons",
      "huerta-irrigation-spain",
      "wolfpak-surfers",
      "erakulapally-seed-sharing"
    ]
  },
  {
    "number": 5,
    "name": "Graduated Sanctions",
    "description": "Commoners MUST devise a system of sanctions to punish anyone who violates the rules, preferably through a gradation of increasingly serious sanctions. Sanctions SHOULD start mild for first offences and escalate for repeat or serious violations, maintaining proportionality and social legitimacy.",
    "diagnostic_questions": [
      "Does the commons have explicit consequences for rule violations rather than relying solely on social pressure?",
      "Are sanctions graduated — starting with a warning or minor penalty and escalating for repeated or serious offences?",
      "Are sanctions perceived as fair and proportionate by the commoners subject to them?",
      "Is enforcement carried out by the community itself or by institutions accountable to it, rather than defaulting entirely to external legal authorities?"
    ],
    "example_commons_ids": [
      "wolfpak-surfers",
      "torbel-alpine-commons",
      "huerta-irrigation-spain",
      "boston-parking-commons"
    ]
  },
  {
    "number": 6,
    "name": "Conflict-Resolution Mechanisms",
    "description": "When disputes arise, commoners MUST have easy access to low-cost, locally legitimate conflict-resolution mechanisms. Disputes MUST NOT be forced exclusively into expensive or inaccessible external legal systems that are beyond the reach of ordinary commoners.",
    "diagnostic_questions": [
      "Is there a recognized, accessible process for resolving disputes among commoners (e.g., mediation, a council of elders, a designated arbitrator)?",
      "Can ordinary commoners afford and realistically use the dispute-resolution process, or does it require expensive legal representation?",
      "Are conflict-resolution outcomes generally accepted as legitimate by the parties involved?",
      "Is the process fast enough to prevent festering disputes from undermining ongoing commoning?"
    ],
    "example_commons_ids": [
      "wolfpak-surfers",
      "huerta-irrigation-spain",
      "torbel-alpine-commons",
      "linux-kernel-development"
    ]
  },
  {
    "number": 7,
    "name": "Minimal Recognition of Rights to Organize",
    "description": "Commoners MUST have their right to self-organize recognized by external governmental authorities. External government MUST NOT systematically undermine or override the legitimate self-governance arrangements that commoners have developed, even when those arrangements are informal or nonstatutory.",
    "diagnostic_questions": [
      "Do external government authorities recognize — even informally — the legitimacy of the commons' self-governance rules?",
      "Is the community free to organize, make rules, and enforce them without being systematically overridden or penalized by the state?",
      "If conflicts arise between vernacular commons rules and official law, is there a workable way for the commons to defend its arrangements?",
      "Have commoners been able to maintain their governance over time without being dismantled by hostile government action?"
    ],
    "example_commons_ids": [
      "wolfpak-surfers",
      "boston-parking-commons",
      "erakulapally-seed-sharing",
      "torbel-alpine-commons"
    ]
  },
  {
    "number": 8,
    "name": "Polycentric Governance (Nested Enterprises)",
    "description": "Commons that are part of a larger system of governance MUST be organized in multiple layers of nested enterprises. Authority to appropriate a resource, monitor and enforce its use, resolve conflicts, and perform other governance activities MUST be shared across different levels — from local to regional to national to international — rather than concentrated at a single level.",
    "diagnostic_questions": [
      "Are governance responsibilities distributed across multiple nested levels (e.g., household, village, regional, national) rather than controlled entirely by one authority?",
      "Do lower-level governance units retain meaningful autonomy and are they not simply subordinated to higher-level bodies?",
      "Are there effective coordination mechanisms linking local commons governance to regional or national institutions where necessary?",
      "When the resource crosses jurisdictional boundaries, is there a functioning multi-level arrangement to manage it?"
    ],
    "example_commons_ids": [
      "los-angeles-groundwater-commons",
      "huerta-irrigation-spain",
      "torbel-alpine-commons",
      "linux-kernel-development"
    ]
  }
];
