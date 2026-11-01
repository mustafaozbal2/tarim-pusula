-- G24: yönetici (admin) yetkili başvurularının hepsini görür (onay ekranı). Yazma yalnız sunucu
-- işlemiyle (karar) yapılır; denetim tetikleyicisi kim/ne zaman kaydeder.
CREATE POLICY staff_profiles_admin ON staff_profiles FOR SELECT TO tp_app USING (app_has_role('admin'));
