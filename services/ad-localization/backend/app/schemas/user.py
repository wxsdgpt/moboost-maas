from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class BrandMembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    brand_id: uuid.UUID
    role: UserRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    name: str
    primary_role: UserRole
    is_system_admin: bool
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    memberships: list[BrandMembershipOut] = Field(default_factory=list)


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=255)
    primary_role: UserRole = UserRole.ad_ops
    is_system_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    primary_role: UserRole | None = None
    is_active: bool | None = None
    is_system_admin: bool | None = None
