"""Le journal de l'app : ce qui s'est passé, pour comprendre après coup un retour de
joueur (« ça a planté à la fin de ma partie ») sans deviner.

Trois sources alimentent la même table (app_events) :
- les événements posés par le code (`record`) : tables créées et finies, coups refusés,
  victoires, refus de triche, déconnexions en pleine partie, erreurs remontées par les
  navigateurs des joueurs (POST /api/client-errors) ;
- le middleware HTTP : exceptions non rattrapées avec leur traceback, 5xx, 429, 403,
  requêtes lentes ;
- les `logger.warning` / `logger.exception` déjà présents partout dans l'app, captés par
  un handler logging.

Rien n'attend l'écriture en base : `record` dépose dans une file, une tâche de fond écrit
par lots. Le panneau admin lit la table (onglet Incidents), et chaque ligne sort aussi
dans journalctl.

models.py   la table app_events
service.py  record, contexte de requête, middleware, handler logging, écriture, lecture
"""

from app.journal.service import bind_player, record

__all__ = ["bind_player", "record"]
