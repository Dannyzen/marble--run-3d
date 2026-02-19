import sqlite3
import datetime

def update_db():
    conn = sqlite3.connect('/home/vagrant/clawd/intelligence.db')
    cursor = conn.cursor()

    # Research Entries
    research_items = [
        ('MAC-AMP: Closed-Loop Multi-Agent Peptide Design', 
         'https://arxiv.org/abs/2602.15836',
         'A closed-loop multi-agent collaboration system for antimicrobial peptide design. Uses iterative feedback to refine molecular structures.'),
        ('MemSkill: Evolvable Memory for LLM Agents', 
         'https://huggingface.co/papers/trending',
         'Learnable memory system with controller-executor-designer components. Dynamically selects/refines memory operations.'),
        ('Memory & Continual Learning Gains in Repo-Level Context', 
         'https://www.llmwatch.com/p/ai-agents-of-the-week-papers-you-43c',
         'Research revealing the impact of specific repository-level context files on coding agent performance.')
    ]

    for title, url, abstract in research_items:
        try:
            cursor.execute('''INSERT INTO research (title, source_url, abstract, added_at) 
                              VALUES (?, ?, ?, datetime('now'))''', (title, url, abstract))
        except sqlite3.IntegrityError:
            pass # Skip duplicates

    # Optimization Entries
    opt_items = [
        ('Physics', 'Parallel Transport Frames for Track Banking', 
         'Use Frenet-Serret or Parallel Transport frames to calculate dynamic banking angles in curvilinear paths.', 
         'Zero ball-phasing in 100 consecutive turns'),
        ('Physics', 'Centripetal Position Clamping', 
         'Hard-snapping bodies to a center-line if radial distance exceeds a threshold to prevent tunneling.', 
         '100% containment regardless of velocity')
    ]

    for cat, desc, notes, provenance in opt_items:
        cursor.execute('''INSERT INTO optimizations (category, description, implementation_notes, provenance) 
                          VALUES (?, ?, ?, ?)''', (cat, desc, notes, provenance))

    conn.commit()
    conn.close()
    print("Database updated successfully.")

if __name__ == "__main__":
    update_db()
