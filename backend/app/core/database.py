from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Aucune requête ne doit pouvoir attendre sans fin (verrou de ligne, base saturée) : le
# joueur verrait un chargement éternel. Tout est borné sous le délai du client (15 s).
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_timeout=10,
    connect_args={
        "command_timeout": 10,
        "server_settings": {
            "statement_timeout": "10000",
            "idle_in_transaction_session_timeout": "30000",
        },
    },
)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
