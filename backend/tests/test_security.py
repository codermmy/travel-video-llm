import jwt
import pytest

from app.core.security import create_access_token, hash_password, verify_password, verify_token


def test_create_and_verify_token() -> None:
    token = create_access_token(subject="user-123")
    assert isinstance(token, str)
    user_id = verify_token(token)
    assert user_id == "user-123"


def test_verify_invalid_token() -> None:
    with pytest.raises(jwt.PyJWTError):
        verify_token("invalid.token.value")


def test_hash_password() -> None:
    """测试密码加密。"""
    password = "testPassword123"
    hashed = hash_password(password)
    assert isinstance(hashed, str)
    assert hashed != password
    # bcrypt 哈希以 $2b$ 开头
    assert hashed.startswith("$2b$")


def test_verify_password_correct() -> None:
    """测试正确密码验证。"""
    password = "testPassword123"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True


def test_verify_password_incorrect() -> None:
    """测试错误密码验证。"""
    password = "testPassword123"
    wrong_password = "wrongPassword123"
    hashed = hash_password(password)
    assert verify_password(wrong_password, hashed) is False


def test_hash_same_password_different_hashes() -> None:
    """测试相同密码产生不同哈希（因为 bcrypt 自动加盐）。"""
    password = "testPassword123"
    hash1 = hash_password(password)
    hash2 = hash_password(password)
    assert hash1 != hash2
    # 但都能验证成功
    assert verify_password(password, hash1) is True
    assert verify_password(password, hash2) is True
