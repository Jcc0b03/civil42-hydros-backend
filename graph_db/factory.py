from __future__ import annotations

from .graph import Graph


def build_default_osint_graph() -> Graph:
    """Create a small, realistic OSINT-oriented seed graph for demo usage."""
    graph = Graph()

    graph.add_node(
        "person:jan-kowalski",
        node_type="person",
        node_data={"name": "Jan Kowalski", "country": "PL", "risk_level": "high"},
    )
    graph.add_node(
        "person:anna-nowak",
        node_type="person",
        node_data={"name": "Anna Nowak", "country": "PL", "risk_level": "low"},
    )
    graph.add_node(
        "org:baltic-logistics",
        node_type="organization",
        node_data={"name": "Baltic Logistics", "sector": "transport", "country": "PL"},
    )
    graph.add_node(
        "domain:bl-cargo.net",
        node_type="domain",
        node_data={"name": "bl-cargo.net", "status": "active"},
    )
    graph.add_node(
        "ip:91.240.11.17",
        node_type="ip_address",
        node_data={"value": "91.240.11.17", "asn": "AS198111", "country": "NL"},
    )
    graph.add_node(
        "wallet:0xA2F9",
        node_type="crypto_wallet",
        node_data={"network": "Ethereum", "risk_level": "high"},
    )

    graph.add_edge("person:jan-kowalski", "org:baltic-logistics", edge_type="director_of", weight=0.9)
    graph.add_edge("person:anna-nowak", "org:baltic-logistics", edge_type="employee_of", weight=0.5)
    graph.add_edge("org:baltic-logistics", "domain:bl-cargo.net", edge_type="owns_domain", weight=1.0)
    graph.add_edge("domain:bl-cargo.net", "ip:91.240.11.17", edge_type="resolves_to", weight=0.95)
    graph.add_edge("person:jan-kowalski", "wallet:0xA2F9", edge_type="controls", weight=0.8)
    graph.add_edge("wallet:0xA2F9", "ip:91.240.11.17", edge_type="observed_from", weight=0.4)

    return graph
