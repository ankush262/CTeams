from datetime import datetime, timedelta

from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# Configure bcrypt for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT (JSON Web Token) is a standard method for secure token-based authentication.
# It's a digitally signed token that contains encoded claims (like user ID).
# We use JWT to:
#   1. Issue tokens after login - client stores token and sends it with each request
#   2. Verify requests without querying the database each time - fast and stateless
# "Signing" means using our SECRET_KEY to cryptographically seal the token data,
# preventing tampering. Only the server can create or validate tokens with the secret.


def hash_password(password: str) -> str:
    """Hash a plain text password using bcrypt for secure storage.
    
    Args:
        password: The plain text password to hash
        
    Returns:
        A bcrypt hash string safe to store in database
    """
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain text password against its bcrypt hash.
    
    Args:
        plain: The plain text password to check
        hashed: The stored bcrypt hash to compare against
        
    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    """Create a signed JWT token for authentication.
    
    Args:
        data: Dictionary of claims to encode (e.g., {"sub": user_id})
        
    Returns:
        A signed JWT token string
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT token, extracting the payload.
    
    Args:
        token: The JWT token string to decode
        
    Returns:
        The decoded token payload as a dictionary
        
    Raises:
        HTTPException: 401 Unauthorized if token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
